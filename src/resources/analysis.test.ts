import { describe, expect, it, jest } from '@jest/globals';
import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';

import { maiaEvaluation } from '@/maia/engine';
import { liteStockfish } from '@/stockfish/engine';
import { NO_RESTARTS } from '@/stockfish/testing';

import {
  AnalysisManager,
  analysisError,
  getAnalysis,
  getAnalysisBehind,
  PositionAnalysis,
} from './analysis';
import { newController, waitForSearch } from './testing';

// Maia runs on a worklet runtime, which Jest doesn't have, so it's scripted.
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));

/** A store with the app's analysis manager, and a scripted Stockfish whose commands are recorded. */
function setUp() {
  const controller = prepareStore(
    initialState,
    () => [new AnalysisManager(), new NetworkManager()],
    Controller,
  ).controller;
  const sent: string[] = [];
  const engine = liteStockfish.attach((command) => sent.push(command), NO_RESTARTS);
  engine.receive('uciok');
  /** Prints a finished depth of Black's three replies to 1.e4, best first. */
  const depth = (depth: number, centipawns = 30) =>
    ['c7c5', 'e7e5', 'e7e6'].forEach((move, i) =>
      engine.receive(
        `info depth ${depth} multipv ${i + 1} score cp ${centipawns - 10 * i} nodes ${depth * 1000} pv ${move}`,
      ),
    );
  const stored = (moves: string) =>
    controller.get(PositionAnalysis, { engine: 'stockfish', moves }, controller.getState());
  return { controller, sent, engine, depth, stored };
}

describe('getAnalysis', () => {
  it('scores a finished game by its result, without asking the engine', async () => {
    // Fool's mate: Black wins.
    const mated = ['f2f3', 'e7e5', 'g2g4', 'd8h4'];
    expect(await newController().fetch(getAnalysis, 'stockfish', mated)).toMatchObject({
      lines: [{ evaluation: { score: 0, pawns: 0 } }],
      depth: 0,
      final: true,
    });
  });

  it("is Maia's evaluation as one line with no move", async () => {
    jest.mocked(maiaEvaluation).mockResolvedValue({ score: 0.6, pawns: 0.4 });
    expect(await newController().fetch(getAnalysis, 'maia', ['e2e4'])).toMatchObject({
      lines: [{ evaluation: { score: 0.6, pawns: 0.4 } }],
      final: true,
    });
  });

  it('answers with the final analysis, and keeps it', async () => {
    const { controller, sent, engine, depth } = setUp();
    const analysis = controller.fetch(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    depth(10);
    depth(11, 40);
    engine.receive('bestmove c7c5');
    expect(await analysis).toMatchObject({ depth: 11, final: true });
    expect((await analysis).lines.map(({ uci }) => uci)).toEqual(['c7c5', 'e7e5', 'e7e6']);
    // Asking again finds it in the store, with no new search.
    expect((await controller.fetchIfStale(getAnalysis, 'stockfish', ['e2e4'])).depth).toBe(11);
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    engine.detach();
  });
});

describe('getAnalysisBehind', () => {
  it('answers with the final analysis, searched behind a shown position', async () => {
    const { controller, sent, engine, depth } = setUp();
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    const behind = controller.fetch(getAnalysisBehind, 'stockfish', ['e2e4', 'e7e5']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(sent).not.toContain('stop');
    depth(10);
    engine.receive('bestmove c7c5');
    await waitForSearch(sent, 'e2e4 e7e5');
    depth(10);
    engine.receive('bestmove c7c5');
    expect(await behind).toMatchObject({ depth: 10, final: true });
    controller.unsubscribe(getAnalysis, 'stockfish', ['e2e4']);
    await new Promise((resolve) => setTimeout(resolve));
    engine.detach();
  });
});

describe('PositionAnalysis', () => {
  it('only deepens: a shallower depth never replaces a deeper one, and nothing replaces a final one', () => {
    const controller = newController();
    const args = { engine: 'stockfish', moves: 'e2e4' } as const;
    const set = (depth: number, final = false) =>
      controller.set(PositionAnalysis, args, { ...args, lines: [], depth, final });
    const depth = () => controller.get(PositionAnalysis, args, controller.getState())?.depth;
    set(12);
    set(11);
    expect(depth()).toBe(12);
    set(13, true);
    set(20);
    expect(depth()).toBe(13);
  });
});

describe('AnalysisManager', () => {
  it('puts each depth of a shown position into the store as it arrives, then the final one', async () => {
    const { controller, sent, engine, depth, stored } = setUp();
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    depth(10);
    expect(stored('e2e4')).toMatchObject({ depth: 10, final: false });
    depth(11);
    expect(stored('e2e4')).toMatchObject({ depth: 11, final: false });
    engine.receive('bestmove c7c5');
    expect(stored('e2e4')).toMatchObject({ depth: 11, final: true });
    engine.detach();
  });

  it('does not settle a fetch with a depth before the final one', async () => {
    const { controller, sent, engine, depth } = setUp();
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    const analysis = controller.fetch(getAnalysis, 'stockfish', ['e2e4']);
    let settled = false;
    void analysis.then(() => (settled = true));
    await waitForSearch(sent, 'e2e4');
    depth(10);
    await new Promise((resolve) => setTimeout(resolve));
    expect(settled).toBe(false);
    engine.receive('bestmove c7c5');
    expect(await analysis).toMatchObject({ depth: 10, final: true });
    engine.detach();
  });

  it('searches a position asked for behind only once the shown one is done, into the same record', async () => {
    const { controller, sent, engine, depth, stored } = setUp();
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    controller.subscribe(getAnalysisBehind, 'stockfish', ['d2d4']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(sent).not.toContain('stop');
    depth(10);
    engine.receive('bestmove c7c5');
    await waitForSearch(sent, 'd2d4');
    engine.receive('info depth 9 multipv 1 score cp 20 nodes 9000 pv d7d5');
    engine.receive('info depth 9 multipv 2 score cp 10 nodes 9000 pv g8f6');
    engine.receive('info depth 9 multipv 3 score cp 0 nodes 9000 pv e7e6');
    expect(stored('d2d4')).toMatchObject({ depth: 9, final: false });
    controller.unsubscribe(getAnalysisBehind, 'stockfish', ['d2d4']);
    await new Promise((resolve) => setTimeout(resolve));
    engine.detach();
  });

  it('stops searching a position no screen shows any more', async () => {
    const { controller, sent, engine } = setUp();
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    controller.unsubscribe(getAnalysis, 'stockfish', ['e2e4']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(sent.at(-1)).toBe('stop');
    engine.detach();
  });

  it('searches nothing for a position whose final analysis the store has', async () => {
    const { controller, sent, engine, depth } = setUp();
    const analysis = controller.fetch(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    depth(10);
    engine.receive('bestmove c7c5');
    await analysis;
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await new Promise((resolve) => setTimeout(resolve));
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    engine.detach();
  });

  it('records a search that gave up, and searches again once it is invalidated', async () => {
    const { controller, sent, engine, depth, stored } = setUp();
    const failed = () =>
      analysisError(controller, 'stockfish', ['e2e4'], controller.getState()) !== undefined;
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    // Stockfish gives up on a search that ends without a score.
    engine.receive('bestmove c7c5');
    await new Promise((resolve) => setTimeout(resolve));
    expect(failed()).toBe(true);
    sent.length = 0;
    await controller.invalidate(getAnalysis, 'stockfish', ['e2e4']);
    expect(failed()).toBe(false);
    await waitForSearch(sent, 'e2e4');
    depth(10);
    engine.receive('bestmove c7c5');
    expect(stored('e2e4')).toMatchObject({ depth: 10, final: true });
    expect(failed()).toBe(false);
    engine.detach();
  });

  it('searches again a background search that gave up, once it is invalidated', async () => {
    const { controller, sent, engine } = setUp();
    controller.subscribe(getAnalysisBehind, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    engine.receive('bestmove c7c5');
    await new Promise((resolve) => setTimeout(resolve));
    expect(analysisError(controller, 'stockfish', ['e2e4'], controller.getState())).toBeDefined();
    sent.length = 0;
    await controller.invalidate(getAnalysis, 'stockfish', ['e2e4']);
    await waitForSearch(sent, 'e2e4');
    controller.unsubscribe(getAnalysisBehind, 'stockfish', ['e2e4']);
    await new Promise((resolve) => setTimeout(resolve));
    engine.detach();
  });

  it('forgets a search that gave up once a later visit gets a depth from it', async () => {
    const { controller, sent, engine, depth } = setUp();
    const failed = () =>
      analysisError(controller, 'stockfish', ['e2e4'], controller.getState()) !== undefined;
    const giveUp = async () => {
      await waitForSearch(sent, 'e2e4');
      engine.receive('bestmove c7c5');
      await new Promise((resolve) => setTimeout(resolve));
    };
    const visit = async () => {
      controller.unsubscribe(getAnalysis, 'stockfish', ['e2e4']);
      await new Promise((resolve) => setTimeout(resolve));
      sent.length = 0;
      controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    };
    controller.subscribe(getAnalysis, 'stockfish', ['e2e4']);
    await giveUp();
    // A visit whose search gives up again at once stays failed, and asks once.
    await visit();
    await giveUp();
    expect(failed()).toBe(true);
    expect(sent.filter((command) => command.startsWith('position'))).toHaveLength(1);
    await visit();
    await waitForSearch(sent, 'e2e4');
    expect(failed()).toBe(true);
    depth(10);
    await new Promise((resolve) => setTimeout(resolve));
    expect(failed()).toBe(false);
    engine.detach();
  });
});
