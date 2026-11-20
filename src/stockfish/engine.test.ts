import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import type { Analysis } from '@/evaluation/evaluation';

import {
  attachStockfish,
  type Connection,
  type SearchBudget,
  stockfishAnalysis,
  watchStockfish,
} from './engine';
import { type NodeEngine, sendTo, startNodeEngine } from './node';
import { NO_RESTARTS } from './testing';

// The real engine the app ships, driven through the app's protocol, with a
// smaller search than the app's so the tests stay quick.
let engine: NodeEngine;
let connection: Connection;

const BUDGET: SearchBudget = { ranks: 3, nodes: 300_000 };

beforeAll(async () => {
  engine = await startNodeEngine();
  connection = attachNodeEngine();
  engine.listener = (line) => connection.receive(line);
}, 30_000);

/** Attaches the Node engine. Nothing restarts it. */
const attachNodeEngine = () => attachStockfish(sendTo(engine), NO_RESTARTS, BUDGET);

afterAll(() => {
  connection.detach();
  engine.terminate?.();
});

/** Watches the position after `line` until its analysis is final, recording every update. */
function watchToEnd(line: readonly string[]) {
  const updates: Analysis[] = [];
  let release = () => {};
  const final = new Promise<Analysis>((resolve, reject) => {
    release = watchStockfish(line, {
      update(analysis) {
        updates.push(analysis);
        if (analysis.final) resolve(analysis);
      },
      fail: reject,
    });
  });
  return { updates, final, release };
}

/** 1.d4 d5 2.c4 c6 3.Nf3 e6 4.Nc3 dxc4 5.a4 Bb4 6.e3 b5 7.axb5 cxb5 8.Bd2 Qb6 9.Be2 Ne7 10.O-O */
const NOTEBOOM =
  'd2d4 d7d5 c2c4 c7c6 g1f3 e7e6 b1c3 d5c4 a2a4 f8b4 e2e3 b7b5 a4b5 c6b5 c1d2 d8b6 f1e2 g8e7 e1g1'.split(
    ' ',
  );

describe('Stockfish', () => {
  it('answers isready at once in the middle of a search', async () => {
    // The watchdog asks a quiet engine this, so a slow depth isn't taken for a stuck engine.
    const heard: string[] = [];
    const listener = engine.listener;
    const send = sendTo(engine);
    try {
      await new Promise<void>((resolve) => {
        engine.listener = (line) => {
          heard.push(line);
          listener?.(line);
          if (line.startsWith('info depth 12 ')) send('isready');
          if (line.startsWith('bestmove')) resolve();
        };
        send('position startpos');
        send('go nodes 2000000');
      });
    } finally {
      engine.listener = listener;
    }
    const answer = heard.indexOf('readyok');
    expect(answer).toBeGreaterThan(-1);
    // Answered while the search still had depths to go (about 19 at this budget).
    expect(heard.slice(answer).filter((line) => / multipv 1 /.test(line)).length).toBeGreaterThan(
      2,
    );
  }, 30_000);

  it('scores a finished game, with no move', async () => {
    // Fool's mate: White is mated.
    const mated = await stockfishAnalysis(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(mated.lines).toEqual([{ evaluation: { score: 0, pawns: 0, mate: 0 } }]);
    expect(mated.final).toBe(true);
    // Stalemate (Sam Loyd's ten-move line): even.
    const stalemate = await stockfishAnalysis(
      'e2e3 a7a5 d1h5 a8a6 h5a5 h7h5 h2h4 a6h6 a5c7 f7f6 c7d7 e8f7 d7b7 d8d3 b7b8 d3h7 b8c8 f7g6 c8e6'.split(
        ' ',
      ),
    );
    expect(stalemate.lines).toHaveLength(1);
    expect(stalemate.lines[0].uci).toBeUndefined();
    expect(stalemate.lines[0].evaluation.score).toBe(0.5);
  });

  it('calls the starting position about even', async () => {
    const [{ evaluation }] = (await stockfishAnalysis([])).lines;
    expect(evaluation.mate).toBe(undefined);
    expect(Math.abs(evaluation.pawns)).toBeLessThan(0.6);
    expect(evaluation.score).toBeGreaterThan(0.45);
    expect(evaluation.score).toBeLessThan(0.6);
  }, 30_000);

  it('sees a mate that Maia misses', async () => {
    // 1.e4 e5 2.Qh5 d6 3.Nf3 Be6 4.Nc3 Nf6 5.Qh4 Be7 6.Ng5 O-O 7.Bd3 Bd7
    // 8.Nd5 Nxd5: White mates with Qxh7. Maia 1900 gives White 59%.
    const line = 'e2e4 e7e5 d1h5 d7d6 g1f3 c8e6 b1c3 g8f6 h5h4 f8e7 f3g5 e8g8 f1d3 e6d7 c3d5 f6d5';
    const [first] = (await stockfishAnalysis(line.split(' '))).lines;
    expect(first).toEqual({ uci: 'h4h7', evaluation: { score: 1, pawns: 0, mate: 1 } });
  }, 30_000);

  it('gives Black the advantage when Black is a queen up', async () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Qxf7+?? Kxf7: Black is a queen for a pawn up.
    const analysis = await stockfishAnalysis(['e2e4', 'e7e5', 'd1h5', 'b8c6', 'h5f7', 'e8f7']);
    expect(analysis.lines[0].evaluation.pawns).toBeLessThan(-5);
    expect(analysis.lines[0].evaluation.score).toBeLessThan(0.15);
  }, 30_000);

  it("ranks three different moves of one depth, the evaluation after each from White's side", async () => {
    // 1.e4 e5 2.Qh5 Nc6 3.Bc4: Black must stop Qxf7#.
    const { lines, depth, final } = await stockfishAnalysis([
      'e2e4',
      'e7e5',
      'd1h5',
      'b8c6',
      'f1c4',
    ]);
    expect(final).toBe(true);
    expect(depth).toBeGreaterThan(10);
    expect(lines).toHaveLength(3);
    expect(new Set(lines.map(({ uci }) => uci)).size).toBe(3);
    // g6 and Qe7 hold; the rest lose at least the f7 pawn.
    expect(['g7g6', 'd8e7', 'd8f6']).toContain(lines[0].uci);
    // Best first: Black's moves, so White's score rises down the list.
    const scores = lines.map(({ evaluation }) => evaluation.score);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  }, 30_000);

  it('ranks only the legal moves there are', async () => {
    // 1.e4 f5 2.Qh5+: only g6 blocks the check.
    const { lines } = await stockfishAnalysis(['e2e4', 'f7f5', 'd1h5']);
    expect(lines.map(({ uci }) => uci)).toEqual(['g7g6']);
  }, 30_000);

  it('settles on the same lines however the search went', async () => {
    // Searched alone: each depth it finishes on the way, deeper each time, then the last as final.
    const alone = watchToEnd(NOTEBOOM);
    const final = await alone.final;
    const depths = alone.updates.map(({ depth }) => depth);
    expect(depths.slice(0, -1)).toEqual([...new Set(depths)].sort((a, b) => a - b));
    expect(final).toEqual({ ...alone.updates.at(-2), final: true });

    // After other positions, and stopped for a newer one partway then started again.
    const before = stockfishAnalysis(['d2d4']);
    await before;
    const resumed = watchToEnd(NOTEBOOM);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const newer = watchToEnd(['e2e4']);
    await newer.final;
    expect(await resumed.final).toEqual(final);
    // Each depth it told on the way is the one the lone search found at that depth.
    for (const update of resumed.updates) {
      expect(update.lines).toEqual(
        alone.updates.find(({ depth }) => depth === update.depth)?.lines,
      );
    }
  }, 60_000);

  it('waits for an engine that starts later', async () => {
    connection.detach();
    const analysis = stockfishAnalysis(['e2e4', 'e7e5']);
    connection = attachNodeEngine();
    expect(Math.abs((await analysis).lines[0].evaluation.pawns)).toBeLessThan(1);
  }, 30_000);
});
