import type { Evaluation, TopMove } from '@/evaluation/evaluation';

import {
  evaluationFromScore,
  multiPvCommand,
  NO_LINES,
  parseBestMove,
  parseInfo,
  positionCommand,
  type RankedLines,
  rankLine,
  type SearchLine,
} from './uci';

/**
 * How long one evaluation searches: 100,000 positions, which reaches about
 * depth 16 and takes about 0.3 s on a recent phone. A node limit gives the
 * same evaluation on every device that reaches it; a phone too slow to
 * reach it in 1.5 s stops there with a shallower one.
 */
const GO = 'go nodes 100000 movetime 1500';

/**
 * How many moves a search for the top moves ranks. It searches as many
 * positions as an evaluation, so it takes as long, but splits them among
 * three lines, which reach about three plies less deep (depth 12 or 13).
 */
const TOP_MOVES = 3;

/**
 * How long the engine may take to answer: its handshake (once its host has
 * handed it its files), or a search (which stops itself after 1.5 s). One
 * that takes longer is stuck, as when Android drops the web view a command
 * went to, and is restarted.
 */
const ANSWER_MS = 10_000;

/** How many engines a search is tried on before it's given up on. */
const TRIES = 2;

/** Sends one UCI command to the engine. */
type Send = (command: string) => void;

/** What an engine tells the host that started it (`useRestarts`). */
export interface Supervisor {
  /** The engine has finished its handshake. */
  ready(): void;
  /** The engine crashed or stopped answering: the host starts another. */
  failed(): void;
}

/** An engine the app is connected to. */
export interface Connection {
  /** Hands the connection a line the engine printed. */
  receive(line: string): void;
  /**
   * Disconnects. What's waiting for an answer stays queued for the next
   * engine attached.
   */
  detach(): void;
  /**
   * Disconnects an engine that crashed, and tells the host to start another
   * (`Supervisor.failed`). The search it was running waits for the next
   * engine, unless it has now been tried on `TRIES` engines.
   */
  fail(message: string): void;
}

/** What a search found: its lines, best first, and the move it would play. */
interface Found {
  readonly lines: readonly SearchLine[];
  readonly best?: string;
}

interface Search {
  readonly line: readonly string[];
  /** How many moves it ranks (MultiPV): 1 for an evaluation. */
  readonly ranks: number;
  resolve(found: Found): void;
  reject(error: Error): void;
  /** Its lines so far: the last whole set Stockfish printed, unless dropped (`rankLine`). */
  ranked: RankedLines<SearchLine>;
  /** How many engines failed while running it. */
  failures: number;
  /**
   * The screen no longer shows this position. A top-moves search only: its
   * result is dropped, and a running one is told to stop.
   */
  cancelled: boolean;
  /**
   * For a top-moves search, the evaluation of the same position, so the bar
   * for it runs first when that evaluation is still waiting.
   */
  after?: Search;
}

/** An attached engine, and whether it has finished its handshake. */
interface Session {
  readonly send: Send;
  readonly supervisor: Supervisor;
  ready: boolean;
  /**
   * How many moves its searches rank (MultiPV), which stays set across new
   * games: set only when it changes, since on Android each command crosses
   * into a web view.
   */
  ranks: number;
}

let connected: Session | undefined;
let running: Search | undefined;
/** Fails the connected engine if it doesn't answer in time. */
let watchdog: ReturnType<typeof setTimeout> | undefined;
/**
 * Searches waiting for the engine. The newest evaluation runs next when it
 * is the newest request, so the bar waits at most for the search already
 * running. A top-moves search then runs ahead of evaluations queued before
 * it, once its own position's evaluation has: move labels need every
 * evaluation, but nothing needs the top moves of a position the board has
 * left, so those are dropped (`supersedeTopMoves`).
 */
const pending: Search[] = [];

/**
 * Connects the engine that `send` talks to. The host that runs the engine
 * (StockfishHost) calls this once the engine has started, hands every line
 * it prints to the returned connection, detaches it when the engine is
 * stopped, and fails it when the engine crashes. An engine that doesn't
 * answer in time fails too. Requests made while no engine is connected wait
 * for one.
 */
export function attachStockfish(send: Send, supervisor: Supervisor): Connection {
  disconnect();
  const session: Session = { send, supervisor, ready: false, ranks: 1 };
  connected = session;
  send('uci');
  awaitAnswer(session);
  return {
    receive(line) {
      if (connected === session) handleLine(session, line);
    },
    detach() {
      if (connected === session) disconnect();
    },
    fail(message) {
      fail(session, message);
    },
  };
}

/**
 * How the position after `line` (UCI moves from the starting position)
 * stands, as Stockfish judges it. Stockfish works on one position at a time:
 * the search under way finishes, then the newest request waiting runs. No
 * request is dropped, so a position the board steps past is still searched
 * (move labels need every position of the game anyway).
 */
export async function stockfishEvaluation(line: readonly string[]): Promise<Evaluation> {
  const { lines, best } = await search(line, 1);
  return { ...evaluationFromScore(lines[0].score, line.length), ...(best && { best }) };
}

/**
 * Stockfish's three best moves in the position after `line`, best first,
 * each with how the position stands after it; fewer when fewer moves are
 * legal, none once the game is over. It runs once that position's evaluation
 * has (see `pending`), ahead of evaluations for positions already left, with
 * a search of its own: three lines reach less deep than one, so an evaluation
 * is never read from it. A newer request, or `signal` aborting, drops this
 * one if it has not finished: the screen no longer shows the position.
 */
export async function stockfishTopMoves(
  line: readonly string[],
  signal?: AbortSignal,
): Promise<TopMove[]> {
  const { lines } = await search(line, TOP_MOVES, signal);
  return lines.flatMap(({ move, score }) =>
    move ? [{ uci: move, evaluation: evaluationFromScore(score, line.length) }] : [],
  );
}

/** A rejection Data Client ignores, so a dropped search is not cached as a failure. */
function abortError(): Error {
  const error = new Error('This position is no longer shown');
  error.name = 'AbortError';
  return error;
}

const sameLine = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((move, i) => move === b[i]);

/** The evaluation of `line` that is running or still waiting, if there is one. */
function evaluationOf(line: readonly string[]): Search | undefined {
  if (running?.ranks === 1 && sameLine(running.line, line)) return running;
  for (let i = pending.length - 1; i >= 0; i--) {
    const search = pending[i];
    if (search.ranks === 1 && sameLine(search.line, line)) return search;
  }
  return undefined;
}

/**
 * Drops a top-moves search the screen no longer shows. One still waiting
 * never starts; one already running is told to stop, and its result is
 * ignored. Evaluations are kept: move labels need every position.
 */
function cancel(search: Search) {
  search.cancelled = true;
  const index = pending.indexOf(search);
  if (index !== -1) pending.splice(index, 1);
  else if (running === search) connected?.send('stop');
  search.reject(abortError());
}

/** Drops every queued top-moves search. The one the screen shows now replaces them. */
function supersedeTopMoves() {
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].ranks > 1) cancel(pending[i]);
  }
}

function search(line: readonly string[], ranks: number, signal?: AbortSignal): Promise<Found> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      settle();
    };
    const entry: Search = {
      line,
      ranks,
      resolve: (found) => finish(() => resolve(found)),
      reject: (error) => finish(() => reject(error)),
      ranked: NO_LINES,
      failures: 0,
      cancelled: false,
    };
    const onAbort = () => cancel(entry);
    // A new top-moves search is the only one the screen still shows.
    if (ranks > 1) {
      supersedeTopMoves();
      entry.after = evaluationOf(line);
    }
    signal?.addEventListener('abort', onAbort);
    pending.push(entry);
    startNext();
  });
}

function handleLine(session: Session, line: string) {
  if (line === 'uciok') {
    clearTimeout(watchdog);
    session.ready = true;
    session.supervisor.ready();
    startNext();
    return;
  }
  if (!running) return;
  const info = parseInfo(line);
  if (info) running.ranked = rankLine(running.ranked, info, info);
  else if (line.startsWith('bestmove')) {
    clearTimeout(watchdog);
    const finished = running;
    running = undefined;
    const lines = finished.ranked.lines.filter(Boolean);
    const best = parseBestMove(line);
    if (lines.length) finished.resolve({ lines, ...(best && { best }) });
    else finished.reject(new Error('Stockfish finished without a score'));
    startNext();
  }
}

/**
 * Takes the search to run next out of `pending`. The newest request, when
 * it is an evaluation, so the bar stays current. Otherwise the newest
 * top-moves search, after the evaluation of its own position when that is
 * still waiting, ahead of evaluations the board has already left.
 */
function takeNext(): Search | undefined {
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].cancelled) pending.splice(i, 1);
  }
  const newest = pending.at(-1);
  if (!newest) return undefined;
  const paired = newest.ranks > 1 ? newest.after : undefined;
  const index =
    paired !== undefined && pending.includes(paired) ? pending.indexOf(paired) : pending.length - 1;
  return pending.splice(index, 1)[0];
}

function startNext() {
  if (!connected?.ready || running) return;
  running = takeNext();
  if (!running) return;
  running.ranked = NO_LINES;
  // A fresh start for every position, so a position always gets the same
  // evaluation whatever came before it.
  connected.send('ucinewgame');
  if (connected.ranks !== running.ranks) {
    connected.ranks = running.ranks;
    connected.send(multiPvCommand(running.ranks));
  }
  connected.send(positionCommand(running.line));
  connected.send(GO);
  awaitAnswer(connected);
}

/** Fails `session` unless it answers within `ANSWER_MS`. */
function awaitAnswer(session: Session) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => fail(session, 'it stopped answering'), ANSWER_MS);
}

/**
 * Disconnects the connected engine, if any. The search it was running will
 * never finish there: the next engine runs it first.
 */
function disconnect() {
  clearTimeout(watchdog);
  connected = undefined;
  if (running) pending.push(running);
  running = undefined;
}

/**
 * `session`'s engine crashed or got stuck: if it's still connected,
 * disconnects it, counting it against its search, and has its host start
 * another.
 */
function fail(session: Session, message: string) {
  if (connected !== session) return;
  console.error(`Stockfish stopped: ${message}`);
  if (running && ++running.failures >= TRIES) {
    // Most likely this position crashes Stockfish: give up on it rather
    // than restart engines forever, and let the searches behind it run.
    running.reject(new Error(`Stockfish stopped ${TRIES} times on this position: ${message}`));
    running = undefined;
  }
  disconnect();
  session.supervisor.failed();
}
