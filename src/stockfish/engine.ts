import type { Evaluation } from '@/evaluation/evaluation';

import { evaluationFromScore, type Info, parseInfo, positionCommand } from './uci';

/**
 * How long one evaluation searches: 100,000 positions, which reaches about
 * depth 16 and takes about 0.3 s on a recent phone, or 1.5 s at most on a slow
 * one. A node limit gives the same evaluation on every device.
 */
const GO = 'go nodes 100000 movetime 1500';

/** Sends one UCI command to the engine. */
export type Send = (command: string) => void;

/** An engine the app is connected to. */
export interface Connection {
  /** Hands the connection a line the engine printed. */
  receive(line: string): void;
  /** Disconnects, failing any evaluation that is waiting for an answer. */
  detach(): void;
}

interface Search {
  readonly line: readonly string[];
  resolve(evaluation: Evaluation): void;
  reject(error: Error): void;
  /** The deepest finished depth so far. */
  last?: Info;
  /** Whether a newer request replaced it; its answer is then thrown away. */
  superseded?: boolean;
}

/** The error a request gets when a newer one replaces it before it's done. */
export class SupersededError extends Error {
  constructor() {
    super('A newer position replaced this one before Stockfish finished');
    this.name = 'SupersededError';
  }
}

let connected: { send: Send; ready: boolean } | undefined;
let running: Search | undefined;
let waiting: Search | undefined;

/**
 * Connects the engine that `send` talks to. The host that runs the engine
 * (StockfishHost) calls this once the engine has started, and hands every
 * line it prints to the returned connection.
 */
export function attachStockfish(send: Send): Connection {
  const session = { send, ready: false };
  // A search the last engine was running will never finish there: run it
  // again on this one, unless a newer request is waiting.
  if (running && !running.superseded && !waiting) waiting = running;
  else running?.reject(new SupersededError());
  running = undefined;
  connected = session;
  send('uci');
  return {
    receive(line) {
      if (connected === session) receive(line);
    },
    detach() {
      if (connected !== session) return;
      connected = undefined;
      stopAll(new Error('Stockfish stopped'));
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

function receive(line: string) {
  if (!connected) return;
  if (line === 'uciok') {
    connected.send('setoption name Hash value 16');
    connected.ready = true;
    startNext();
    return;
  }
  if (!running) return;
  const info = parseInfo(line);
  if (info) running.last = info;
  else if (line.startsWith('bestmove')) {
    const { last, superseded, line: moves } = running;
    if (superseded) running.reject(new SupersededError());
    else if (last) running.resolve(evaluationFromScore(last.score, moves.length));
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

function stopAll(error: Error) {
  running?.reject(error);
  waiting?.reject(error);
  running = waiting = undefined;
}
