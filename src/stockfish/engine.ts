import type { Evaluation } from '@/evaluation/evaluation';

import { evaluationFromScore, parseScore, positionCommand, type Score } from './uci';

/**
 * How long one evaluation searches: 100,000 positions, which reaches about
 * depth 16 and takes about 0.3 s on a recent phone. A node limit gives the
 * same evaluation on every device that reaches it; a phone too slow to
 * reach it in 1.5 s stops there with a shallower one.
 */
const GO = 'go nodes 100000 movetime 1500';

/** Sends one UCI command to the engine. */
type Send = (command: string) => void;

/** An engine the app is connected to. */
export interface Connection {
  /** Hands the connection a line the engine printed. */
  receive(line: string): void;
  /**
   * Disconnects. What's waiting for an answer stays queued for the next
   * engine attached.
   */
  detach(): void;
}

interface Search {
  readonly line: readonly string[];
  resolve(evaluation: Evaluation): void;
  reject(error: Error): void;
  /** The score of the deepest depth finished so far. */
  last?: Score;
  /** Whether a newer request replaced it; its answer is then thrown away. */
  superseded?: boolean;
}

/** The error a request gets when a newer one replaces it before it's done. */
export class SupersededError extends Error {
  constructor() {
    super('A newer position replaced this one before Stockfish finished');
    // Data Client keeps nothing for a request that fails with an AbortError,
    // as if it never ran, so coming back to this position evaluates it.
    this.name = 'AbortError';
  }
}

/** An attached engine, and whether it has finished its handshake. */
interface Session {
  readonly send: Send;
  ready: boolean;
}

let connected: Session | undefined;
let running: Search | undefined;
let waiting: Search | undefined;

/**
 * Connects the engine that `send` talks to. The host that runs the engine
 * (StockfishHost) calls this once the engine has started, hands every line
 * it prints to the returned connection, and detaches it when the engine is
 * stopped or fails. Requests made while no engine is connected wait for one.
 */
export function attachStockfish(send: Send): Connection {
  handOverRunning();
  const session: Session = { send, ready: false };
  connected = session;
  send('uci');
  return {
    receive(line) {
      if (connected === session) handleLine(session, line);
    },
    detach() {
      if (connected !== session) return;
      connected = undefined;
      handOverRunning();
    },
  };
}

/**
 * How the position after `line` (UCI moves from the starting position)
 * stands, as Stockfish judges it. Stockfish works on one position at a time
 * and only the newest request matters, so a newer request stops this one,
 * which then fails with a SupersededError.
 */
export function stockfishEvaluation(line: readonly string[]): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    waiting?.reject(new SupersededError());
    waiting = { line, resolve, reject };
    if (running && !running.superseded) {
      running.superseded = true;
      connected?.send('stop');
    }
    startNext();
  });
}

function handleLine(session: Session, line: string) {
  if (line === 'uciok') {
    session.ready = true;
    startNext();
    return;
  }
  if (!running) return;
  const score = parseScore(line);
  if (score) running.last = score;
  else if (line.startsWith('bestmove')) {
    const { last, superseded, line: moves } = running;
    if (superseded) running.reject(new SupersededError());
    else if (last) running.resolve(evaluationFromScore(last, moves.length));
    else running.reject(new Error('Stockfish finished without a score'));
    running = undefined;
    startNext();
  }
}

function startNext() {
  if (!connected?.ready || running || !waiting) return;
  running = waiting;
  waiting = undefined;
  // A fresh start for every position, so a position always gets the same
  // evaluation whatever came before it.
  connected.send('ucinewgame');
  connected.send(positionCommand(running.line));
  connected.send(GO);
}

/**
 * The search the engine was running will never finish there: hands it to
 * the next engine, or fails it with SupersededError if a newer request
 * replaced it.
 */
function handOverRunning() {
  if (running && !running.superseded && !waiting) {
    running.last = undefined;
    waiting = running;
  } else running?.reject(new SupersededError());
  running = undefined;
}
