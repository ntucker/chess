import type { Evaluation, TopMove } from '@/evaluation/evaluation';

import {
  evaluationFromScore,
  multiPvCommand,
  NO_LINES,
  parseInfo,
  positionCommand,
  type RankedLines,
  rankedLines,
  rankLine,
  type SearchLine,
} from './uci';

/**
 * How many positions a search spends on each move it ranks. An evaluation
 * ranks one: 100,000 positions, which reaches about depth 14 and takes about
 * 0.3 s on a recent phone. A search for the top moves splits its positions
 * among its lines, so it gets as many for each, three times as long, to rank
 * them as deep as an evaluation judges the move played: a move's label can
 * read its listed score (`listJudgement`).
 */
const NODES_PER_RANK = 100_000;

/**
 * The command that starts a search ranking `ranks` moves. A node limit gives
 * the same result on every device that reaches it; a phone too slow to
 * reach it in 1.5 s for each rank stops there with a shallower one.
 */
const goCommand = (ranks: number) => `go nodes ${NODES_PER_RANK * ranks} movetime ${1500 * ranks}`;

/** How many moves a search for the top moves ranks. */
const TOP_MOVES = 3;

/**
 * How long the engine may take to answer: its handshake (once its host has
 * handed it its files), or a search (which stops itself after 4.5 s at most). One
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

interface Search {
  readonly line: readonly string[];
  /** How many moves it ranks (MultiPV): 1 for an evaluation. */
  readonly ranks: number;
  resolve(lines: readonly SearchLine[]): void;
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
 * left, so a newer one drops those, waiting or running (`supersedeTopMoves`).
 * That holds while one screen at a time asks for top moves (the lesson's).
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
  // The best move is the scored line's, not `bestmove`'s, which can come
  // from a depth whose score was dropped (`rankLine`).
  const [{ score, move }] = await search(line, 1);
  return { ...evaluationFromScore(score, line.length), ...(move && { best: move }) };
}

/**
 * Stockfish's three best moves in the position after `line`, best first,
 * each with how the position stands after it; fewer when fewer moves are
 * legal, none once the game is over. It runs once that position's evaluation
 * has (see `pending`), ahead of evaluations for positions already left, with
 * a search of its own (three times an evaluation's positions, `NODES_PER_RANK`).
 * An evaluation is never read from it, so a position's evaluation stays the
 * same whether or not its top moves were asked for. A newer request drops this one if it has not
 * finished: one still waiting never starts, and one already running is
 * told to stop. Its result is ignored. A search already running when the
 * screen leaves without asking for another finishes, and is kept.
 */
export async function stockfishTopMoves(line: readonly string[]): Promise<TopMove[]> {
  const lines = await search(line, TOP_MOVES);
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

/** Drops every top-moves search the screen has left, including one already running. */
function supersedeTopMoves() {
  for (let i = pending.length - 1; i >= 0; i--) {
    if (pending[i].ranks > 1) cancel(pending[i]);
  }
  if (running && !running.cancelled && running.ranks > 1) cancel(running);
}

function search(line: readonly string[], ranks: number): Promise<readonly SearchLine[]> {
  return new Promise((resolve, reject) => {
    // A new top-moves search is the only one the screen still shows.
    if (ranks > 1) supersedeTopMoves();
    pending.push({ line, ranks, resolve, reject, ranked: NO_LINES, failures: 0, cancelled: false });
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
    const lines = rankedLines(finished.ranked);
    if (lines.length) finished.resolve(lines);
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
  const newest = pending.at(-1);
  if (!newest) return undefined;
  const paired =
    newest.ranks > 1
      ? pending.findLastIndex(({ ranks, line }) => ranks === 1 && sameLine(line, newest.line))
      : -1;
  return pending.splice(paired === -1 ? pending.length - 1 : paired, 1)[0];
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
  connected.send(goCommand(running.ranks));
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
  // A top-moves search the screen dropped while it ran is not queued again.
  if (running && !running.cancelled) pending.push(running);
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
