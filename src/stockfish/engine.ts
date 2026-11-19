import type { Evaluation } from '@/evaluation/evaluation';

import { evaluationFromScore, parseBestMove, parseScore, positionCommand, type Score } from './uci';

/**
 * How long one evaluation searches: 100,000 positions, which reaches about
 * depth 16 and takes about 0.3 s on a recent phone. A node limit gives the
 * same evaluation on every device that reaches it; a phone too slow to
 * reach it in 1.5 s stops there with a shallower one.
 */
const GO = 'go nodes 100000 movetime 1500';

/**
 * How long a search may take (it stops itself after 1.5 s). An engine that
 * takes longer is stuck, as when Android drops the web view a command went
 * to, and is restarted.
 */
const SEARCH_MS = 10_000;

/**
 * How long a new engine may take to finish its handshake. On the web this
 * includes downloading the 1.8 MB WebAssembly, so a slow connection gets a
 * minute before the download starts over.
 */
const HANDSHAKE_MS = 60_000;

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
  resolve(evaluation: Evaluation): void;
  reject(error: Error): void;
  /** The score of the deepest depth finished so far. */
  last?: Score;
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
 * Searches waiting for the engine. The last runs next: the newest request, or
 * a search a stopped engine handed back.
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
  awaitAnswer(session, HANDSHAKE_MS);
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
export function stockfishEvaluation(line: readonly string[]): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    pending.push({ line, resolve, reject, failures: 0 });
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
  const score = parseScore(line);
  if (score) running.last = score;
  else if (line.startsWith('bestmove')) {
    clearTimeout(watchdog);
    const search = running;
    running = undefined;
    if (search.last) search.resolve(evaluation(search.last, search.line, line));
    else search.reject(new Error('Stockfish finished without a score'));
    startNext();
  }
}

/** A finished search's evaluation, with the move its `bestmove` line names. */
function evaluation(score: Score, moves: readonly string[], bestmoveLine: string): Evaluation {
  const best = parseBestMove(bestmoveLine);
  return { ...evaluationFromScore(score, moves.length), ...(best && { best }) };
}

function startNext() {
  if (!connected?.ready || running) return;
  running = pending.pop();
  if (!running) return;
  running.last = undefined;
  // A fresh start for every position, so a position always gets the same
  // evaluation whatever came before it.
  connected.send('ucinewgame');
  connected.send(positionCommand(running.line));
  connected.send(GO);
  awaitAnswer(connected, SEARCH_MS);
}

/** Fails `session` unless it answers within `ms`. */
function awaitAnswer(session: Session, ms: number) {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => fail(session, 'it stopped answering'), ms);
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
