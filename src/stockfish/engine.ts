import type { Evaluation } from '@/evaluation/evaluation';

import { evaluationFromScore, parseBestMove, parseScore, positionCommand, type Score } from './uci';

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
}

/** An attached engine, and whether it has finished its handshake. */
interface Session {
  readonly send: Send;
  ready: boolean;
}

let connected: Session | undefined;
let running: Search | undefined;
/** Searches waiting for the engine, newest last; the newest runs first. */
const pending: Search[] = [];
/**
 * Where the running search goes back into `pending` once it stops: below the
 * newer request that stopped it. Undefined while it isn't being stopped.
 */
let stoppedAt: number | undefined;

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
 * stands, as Stockfish judges it. Stockfish works on one position at a time,
 * newest first: a newer request stops the search under way, which runs again
 * from the start once the newer ones are done. No request is dropped.
 */
export function stockfishEvaluation(line: readonly string[]): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    pending.push({ line, resolve, reject });
    if (running && stoppedAt === undefined) {
      stoppedAt = pending.length - 1;
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
    const search = running;
    running = undefined;
    if (stoppedAt !== undefined) requeue(search);
    else if (search.last) search.resolve(evaluation(search.last, search.line, line));
    else search.reject(new Error('Stockfish finished without a score'));
    startNext();
  }
}

/** The evaluation a finished search gives, with the move its `bestmove` line names. */
function evaluation(score: Score, line: readonly string[], bestmove: string): Evaluation {
  const best = parseBestMove(bestmove);
  return { ...evaluationFromScore(score, line.length), ...(best && { best }) };
}

function startNext() {
  if (!connected?.ready || running) return;
  running = pending.pop();
  if (!running) return;
  // A fresh start for every position, so a position always gets the same
  // evaluation whatever came before it.
  connected.send('ucinewgame');
  connected.send(positionCommand(running.line));
  connected.send(GO);
}

/**
 * Puts a search that didn't finish back to wait, from the start: below the
 * request that stopped it, or on top if nothing newer came.
 */
function requeue(search: Search) {
  search.last = undefined;
  pending.splice(stoppedAt ?? pending.length, 0, search);
  stoppedAt = undefined;
}

/** The search the engine was running will never finish there: the next engine runs it. */
function handOverRunning() {
  if (running) requeue(running);
  running = undefined;
}
