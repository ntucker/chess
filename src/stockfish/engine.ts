import type { Evaluation, TopMove } from '@/evaluation/evaluation';

import {
  evaluationFromScore,
  multiPvCommand,
  parseBestMove,
  parseInfo,
  positionCommand,
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
  /** Each rank's line at the deepest depth finished so far, by rank. */
  lines: SearchLine[];
  /** How many engines failed while running it. */
  failures: number;
}

/** An attached engine, and whether it has finished its handshake. */
interface Session {
  readonly send: Send;
  readonly supervisor: Supervisor;
  ready: boolean;
}

let connected: Session | undefined;
let running: Search | undefined;
/** Fails the connected engine if it doesn't answer in time. */
let watchdog: ReturnType<typeof setTimeout> | undefined;
/**
 * Searches waiting for the engine. The last evaluation runs next (the newest
 * request, or a search a stopped engine handed back), and a search for the
 * top moves only once no evaluation waits, so the evaluation bar and move
 * labels never wait behind one.
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
  const session: Session = { send, supervisor, ready: false };
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
 * legal, none once the game is over. It runs after every evaluation waiting
 * (see `pending`), with a search of its own: three lines reach less deep than
 * one, so an evaluation is never read from it.
 */
export async function stockfishTopMoves(line: readonly string[]): Promise<TopMove[]> {
  const { lines } = await search(line, TOP_MOVES);
  return lines.flatMap(({ move, score }) =>
    move ? [{ uci: move, evaluation: evaluationFromScore(score, line.length) }] : [],
  );
}

function search(line: readonly string[], ranks: number): Promise<Found> {
  return new Promise((resolve, reject) => {
    pending.push({ line, ranks, resolve, reject, lines: [], failures: 0 });
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
  if (info) running.lines[info.rank - 1] = info;
  else if (line.startsWith('bestmove')) {
    clearTimeout(watchdog);
    const search = running;
    running = undefined;
    const lines = search.lines.filter(Boolean);
    const best = parseBestMove(line);
    if (lines.length) search.resolve({ lines, ...(best && { best }) });
    else search.reject(new Error('Stockfish finished without a score'));
    startNext();
  }
}

/** Takes the search to run next out of `pending`: the last evaluation, or else the last search. */
function takeNext(): Search | undefined {
  const evaluation = pending.findLastIndex(({ ranks }) => ranks === 1);
  return pending.splice(evaluation === -1 ? -1 : evaluation, 1)[0];
}

function startNext() {
  if (!connected?.ready || running) return;
  running = takeNext();
  if (!running) return;
  running.lines = [];
  // A fresh start for every position, so a position always gets the same
  // evaluation whatever came before it. MultiPV stays set across a new game,
  // so every search sets it.
  connected.send('ucinewgame');
  connected.send(multiPvCommand(running.ranks));
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
