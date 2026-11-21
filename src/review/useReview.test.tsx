import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, getDefaultManagers, useController } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { AnalysisManager, getAnalysis, PositionAnalysis } from '@/resources/analysis';

import { partial } from './review.fixture';
import { type Review, useReview } from './useReview';

// Every position the review has Stockfish search, by the moves before it; none answers.
const mockSearched: string[] = [];
jest.mock('@/stockfish/engine', () => ({
  liteStockfish: {
    watch: (line: readonly string[]) => {
      mockSearched.push(line.join(' '));
      return () => {};
    },
  },
}));
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));
jest.mock('@/stockfish/demand', () => ({ useNeedsStockfish: () => {} }));

const MOVES = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];

let root: Root | undefined;
let controller: Controller;
let review: Review;
const managers = () => [new AnalysisManager(), ...getDefaultManagers()];

function Reviewed({ active }: { readonly active: boolean }) {
  controller = useController();
  review = useReview({ moves: MOVES, learner: 'black', active });
  return null;
}

const render = (active = true) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider managers={managers}>
        <Reviewed active={active} />
      </DataProvider>,
    );
  });

/** Stores a sketch of the position after the first `plies` moves. */
const sketch = (plies: number) =>
  act(async () => {
    const args = { engine: 'stockfish', moves: MOVES.slice(0, plies).join(' ') } as const;
    controller.set(PositionAnalysis, args, { ...args, ...partial(12, ['a2a3', 0.5]) });
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  mockSearched.length = 0;
  jest.useRealTimers();
});

describe('useReview', () => {
  it('asks for one position at a time, moving on as each sketch lands', async () => {
    await render();
    expect(mockSearched).toEqual(['']);
    await sketch(0);
    expect(mockSearched).toEqual(['', 'e2e4']);
    expect(review.waiting).toBe(4);
  });

  it('asks for nothing behind another screen', async () => {
    await render(false);
    expect(mockSearched).toEqual([]);
    await render(true);
    expect(mockSearched).toEqual(['']);
  });

  it('skips a position whose search gave up, and searches it again on Try again', async () => {
    await render();
    await act(async () => {
      void controller.setError(getAnalysis, 'stockfish', [], new Error('gave up'));
    });
    expect(mockSearched).toEqual(['', 'e2e4']);
    expect(review.moves[0].status).toBe('failed');
    await act(async () => review.tryAgain(1));
    expect(review.moves[0].status).toBe('waiting');
    expect(mockSearched.at(-1)).toBe('');
  });

  it('searches the move the board rests on, once it has rested about a second', async () => {
    await render();
    jest.useFakeTimers();
    await act(async () => review.goto(3));
    await act(async () => {
      jest.advanceTimersByTime(999);
    });
    expect(review.dwelt).toBeUndefined();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    // The position before 2.Nf3 first: its label needs it, then the one after.
    expect(mockSearched).toEqual(['', 'e2e4 e7e5']);
    expect(review.visited).toEqual(new Set([3]));
  });
});
