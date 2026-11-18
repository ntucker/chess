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
 * The newer request that stopped the running search, which goes back into
 * `pending` just below it once it stops. Undefined while it isn't stopping.
 */
let stoppedBy: Search | undefined;

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
 * from the start once the newer ones are done. No request is dropped, so a
 * position the board steps past is still searched later (move labels need
 * every position of the game anyway).
 */
export function stockfishEvaluation(line: readonly string[]): Promise<Evaluation> {
  return new Promise((resolve, reject) => {
    const search: Search = { line, resolve, reject };
    pending.push(search);
    if (running && !stoppedBy) {
      stoppedBy = search;
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
    if (stoppedBy) requeue(search);
    else if (search.last) search.resolve(evaluation(search.last, search.line, line));
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
  const at = stoppedBy ? pending.indexOf(stoppedBy) : -1;
  pending.splice(at < 0 ? pending.length : at, 0, search);
  stoppedBy = undefined;
}

/** The search the engine was running will never finish there: the next engine runs it. */
function handOverRunning() {
  if (running) requeue(running);
  running = undefined;
}
