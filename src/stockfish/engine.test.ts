import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { attachStockfish, type Connection, stockfishEvaluation } from './engine';
import { NO_RESTARTS, type NodeEngine, sendTo, startNodeEngine } from './testing';

// The real engine the app ships, driven through the app's protocol.
let engine: NodeEngine;
let connection: Connection;

beforeAll(async () => {
  engine = await startNodeEngine();
  connection = attachNodeEngine();
  engine.listener = (line) => connection.receive(line);
}, 30_000);

/** Attaches the Node engine. Nothing restarts it. */
const attachNodeEngine = () => attachStockfish(sendTo(engine), NO_RESTARTS);

afterAll(() => {
  connection.detach();
  engine.terminate?.();
});

describe('stockfishEvaluation', () => {
  it('calls the starting position about even', async () => {
    const { score, pawns, mate } = await stockfishEvaluation([]);
    expect(mate).toBe(undefined);
    expect(Math.abs(pawns)).toBeLessThan(0.6);
    expect(score).toBeGreaterThan(0.45);
    expect(score).toBeLessThan(0.6);
  }, 30_000);

  it('sees a mate that Maia misses', async () => {
    // 1.e4 e5 2.Qh5 d6 3.Nf3 Be6 4.Nc3 Nf6 5.Qh4 Be7 6.Ng5 O-O 7.Bd3 Bd7
    // 8.Nd5 Nxd5: White mates with Qxh7. Maia 1900 gives White 59%.
    const line = 'e2e4 e7e5 d1h5 d7d6 g1f3 c8e6 b1c3 g8f6 h5h4 f8e7 f3g5 e8g8 f1d3 e6d7 c3d5 f6d5';
    expect(await stockfishEvaluation(line.split(' '))).toEqual({
      score: 1,
      pawns: 0,
      mate: 1,
      best: 'h4h7',
    });
  }, 30_000);

  it('gives Black the advantage when Black is a queen up', async () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Qxf7+?? Kxf7: Black is a queen for a pawn up.
    const { score, pawns } = await stockfishEvaluation([
      'e2e4',
      'e7e5',
      'd1h5',
      'b8c6',
      'h5f7',
      'e8f7',
    ]);
    expect(pawns).toBeLessThan(-5);
    expect(score).toBeLessThan(0.15);
  }, 30_000);

  it('waits for an engine that starts later', async () => {
    connection.detach();
    const evaluation = stockfishEvaluation(['e2e4']);
    connection = attachNodeEngine();
    expect(Math.abs((await evaluation).pawns)).toBeLessThan(1);
  }, 30_000);

  it('answers every position asked for, one at a time', async () => {
    const older = stockfishEvaluation(['d2d4']);
    const newer = stockfishEvaluation(['d2d4', 'd7d5']);
    const finished: string[] = [];
    await Promise.all([
      older.then(() => finished.push('older')),
      newer.then(() => finished.push('newer')),
    ]);
    // The first had already started, so it finishes first.
    expect(finished).toEqual(['older', 'newer']);
  }, 30_000);
});
