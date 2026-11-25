import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, getDefaultManagers, useController } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { Uci } from '@/lesson/lesson';
import { AnalysisManager, getAnalysis, PositionAnalysis } from '@/resources/analysis';
import { getMaiaShares } from '@/resources/maia';
import { listing } from '@/review/review.fixture';

import * as finder from './finder';
import { type FinderAsk, type FinderRun, useFinder } from './useFinder';

// Every search the finder asks Stockfish for, and whether it waits behind the others; none answers.
const mockWatched: { line: string; behind: boolean }[] = [];
jest.mock('@/stockfish/engine', () => ({
  liteStockfish: {
    watch: (line: readonly string[], _watcher: unknown, options?: { behind?: boolean }) => {
      mockWatched.push({ line: line.join(' '), behind: !!options?.behind });
      return () => {};
    },
  },
}));
// Maia's shares: every position's first legal move is all it plays.
const mockShares = jest.fn(async (_rating: number, _line: readonly string[]) => ({ a7a6: 1 }));
jest.mock('@/maia/engine', () => ({
  maiaShares: (rating: number, line: readonly string[]) => mockShares(rating, line),
  maiaMove: jest.fn(),
  maiaEvaluation: jest.fn(),
}));
const mockNeeds: boolean[] = [];
jest.mock('@/stockfish/demand', () => ({
  useNeedsStockfish: (needed: boolean) => void mockNeeds.push(needed),
}));

/** The Stafford Gambit after 4...dxc6, White to move. */
const STAFFORD: readonly Uci[] = ['e2e4', 'e7e5', 'g1f3', 'g8f6', 'f3e5', 'b8c6', 'e5c6', 'd7c6'];
const ASK: FinderAsk = { line: STAFFORD, side: 'white', rating: 1500 };

let root: Root | undefined;
const controllers: Controller[] = [];
const runs: FinderRun[] = [];
const managers = () => [new AnalysisManager(), ...getDefaultManagers()];

function Finder({ ask }: { readonly ask: FinderAsk | undefined }) {
  controllers.push(useController());
  runs.push(useFinder(ask));
  return null;
}

const render = (ask: FinderAsk | undefined) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider managers={managers}>
        <Finder ask={ask} />
      </DataProvider>,
    );
  });

/** Stores Stockfish's final analysis after `line`, with `best` its one line. */
const analyse = (line: readonly Uci[], best: Uci) =>
  act(async () => {
    const args = { engine: 'stockfish', moves: line.join(' ') } as const;
    controllers[0].set(PositionAnalysis, args, { ...args, ...listing([best, 0.6]) });
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  controllers.length = 0;
  mockWatched.length = 0;
  mockNeeds.length = 0;
  runs.length = 0;
  mockShares.mockClear();
  jest.restoreAllMocks();
});

describe('useFinder', () => {
  it('works out and asks for nothing without an ask', async () => {
    await render(undefined);
    expect(runs.at(-1)).toEqual({ finds: [], running: false });
    expect(mockWatched).toEqual([]);
    expect(mockShares).not.toHaveBeenCalled();
    expect(mockNeeds.at(-1)).toBe(false);
  });

  it("searches where it opens behind the board's searches, then asks Maia for the replies to Stockfish's move", async () => {
    await render(ASK);
    expect(runs.at(-1)!.running).toBe(true);
    expect(mockNeeds.at(-1)).toBe(true);
    expect(mockWatched).toEqual([{ line: STAFFORD.join(' '), behind: true }]);
    expect(mockShares).not.toHaveBeenCalled();

    await analyse(STAFFORD, 'd2d3');
    expect(mockShares).toHaveBeenCalledWith(1500, [...STAFFORD, 'd2d3']);
  });

  it('stops asking once the ask is gone', async () => {
    await render(ASK);
    await render(undefined);
    expect(runs.at(-1)).toEqual({ finds: [], running: false });
    expect(mockNeeds.at(-1)).toBe(false);
    await analyse(STAFFORD, 'd2d3');
    expect(mockShares).not.toHaveBeenCalled();
  });

  it('asks Maia for four positions at a time, and Stockfish for the first search only', async () => {
    const spot = (n: number) => ({ line: [...STAFFORD, `a${n}`], key: `k${n}` });
    jest.spyOn(finder, 'findOpportunities').mockReturnValue({
      finds: [],
      dropped: [],
      offGuide: [],
      thin: [],
      requests: [
        ...[1, 2, 3, 4, 5, 6].map((n) => ({ kind: 'replies' as const, spot: spot(n) })),
        { kind: 'sketch', spot: spot(7) },
        { kind: 'full', spot: spot(8) },
      ],
    });
    await render(ASK);
    expect(mockShares.mock.calls.map(([, line]) => line.at(-1))).toEqual(['a1', 'a2', 'a3', 'a4']);
    expect(mockWatched).toEqual([{ line: spot(7).line.join(' '), behind: true }]);
  });

  it('leaves out an answer that failed, ends the run when only failed ones are left, and retries them', async () => {
    await render(ASK);
    await act(async () => {
      controllers[0].setError(getAnalysis, 'stockfish', STAFFORD, new Error('gave up'));
    });
    expect(runs.at(-1)).toMatchObject({ finds: [], running: false });
    expect(mockNeeds.at(-1)).toBe(false);
    // Retrying clears the error, and the search is asked for again.
    mockWatched.length = 0;
    await act(async () => runs.at(-1)!.retry!());
    expect(runs.at(-1)).toMatchObject({ running: true, retry: undefined });
    expect(mockWatched).toContainEqual({ line: STAFFORD.join(' '), behind: true });

    // Maia's failure is left out and retried the same way.
    mockShares.mockImplementationOnce(() => new Promise(() => {}));
    await analyse(STAFFORD, 'd2d3');
    expect(runs.at(-1)!.running).toBe(true);
    await act(async () => {
      controllers[0].setError(getMaiaShares, 1500, [...STAFFORD, 'd2d3'], new Error('threw'));
    });
    expect(runs.at(-1)!.running).toBe(false);
    mockShares.mockClear();
    await act(async () => runs.at(-1)!.retry!());
    expect(mockShares).toHaveBeenCalledWith(1500, [...STAFFORD, 'd2d3']);
  });
});
