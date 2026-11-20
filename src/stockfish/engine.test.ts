import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { attachStockfish, type Connection, stockfishEvaluation, stockfishTopMoves } from './engine';
import { type NodeEngine, sendTo, startNodeEngine } from './node';
import { NO_RESTARTS } from './testing';

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

describe('Stockfish', () => {
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

  it("ranks three different moves, the evaluation after each from White's side", async () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4: Black must stop Qxf7#.
    const top = await stockfishTopMoves(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'f1c4']);
    expect(top).toHaveLength(3);
    expect(new Set(top.map(({ uci }) => uci)).size).toBe(3);
    // g6 and Qe7 hold; the rest lose at least the f7 pawn.
    expect(['g7g6', 'd8e7', 'd8f6']).toContain(top[0].uci);
    // Best first: Black's moves, so White's score rises down the list.
    const scores = top.map(({ evaluation }) => evaluation.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  }, 30_000);

  it('lists each move once when the search stops inside its last depth', async () => {
    // 1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nf3 e6 5.Bd3 Bxd3 6.Qxd3 Nd7 7.c3 c5 8.O-O
    // cxd4 9.cxd4 Ne7 10.Nc3 Nc6: the node limit cuts depth 13's third line
    // short, and mixing it with depth 12's listed h4 twice.
    const line =
      'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1d3 f5d3 d1d3 b8d7 c2c3 c6c5 e1g1 c5d4 c3d4 g8e7 b1c3 e7c6';
    const top = await stockfishTopMoves(line.split(' '));
    expect(top.map(({ uci }) => uci)).toEqual(['h2h4', 'g2g3', 'c3e2']);
  }, 30_000);

  it('ranks only the legal moves there are', async () => {
    // 1.e4 f5 2.Qh5+: only g6 blocks the check.
    const top = await stockfishTopMoves(['e2e4', 'f7f5', 'd1h5']);
    expect(top.map(({ uci }) => uci)).toEqual(['g7g6']);
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
