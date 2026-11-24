import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, getDefaultManagers, useController } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { AnalysisManager, getAnalysis, PositionAnalysis } from '@/resources/analysis';

import { listing, partial } from './review.fixture';
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
const controllers: Controller[] = [];
const reviews: Review[] = [];
const managers = () => [new AnalysisManager(), ...getDefaultManagers()];

function Reviewed({ active, moves }: { readonly active: boolean; readonly moves: string[] }) {
  controllers.push(useController());
  reviews.push(useReview({ moves, learner: 'black', active }));
  return null;
}

const render = (active = true, moves = MOVES) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider managers={managers}>
        <Reviewed active={active} moves={moves} />
      </DataProvider>,
    );
  });

/** Stores a sketch of the position after the first `plies` moves. */
const sketch = (plies: number) =>
  act(async () => {
    const args = { engine: 'stockfish', moves: MOVES.slice(0, plies).join(' ') } as const;
    controllers[0].set(PositionAnalysis, args, { ...args, ...partial(12, ['a2a3', 0.5]) });
  });

/** Stores the final analysis of the position after the first `plies` moves of `moves`. */
const finalOf = (moves: readonly string[], plies: number, ...lines: Parameters<typeof listing>) =>
  act(async () => {
    const args = { engine: 'stockfish', moves: moves.slice(0, plies).join(' ') } as const;
    controllers[0].set(PositionAnalysis, args, { ...args, ...listing(...lines) });
  });
/** `finalOf` the review's usual game. */
const final = (plies: number, ...lines: Parameters<typeof listing>) =>
  finalOf(MOVES, plies, ...lines);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  mockSearched.length = 0;
  controllers.length = 0;
  reviews.length = 0;
  jest.useRealTimers();
});

describe('useReview', () => {
  it('asks for one position at a time, moving on as each sketch lands', async () => {
    await render();
    expect(mockSearched).toEqual(['']);
    await sketch(0);
    expect(mockSearched).toEqual(['', 'e2e4']);
    expect(reviews.at(-1)!.moves.map(({ status }) => status)).toEqual(Array(4).fill('waiting'));
  });

  it('asks for nothing behind another screen', async () => {
    await render(false);
    expect(mockSearched).toEqual([]);
    await render(true);
    expect(mockSearched).toEqual(['']);
  });

  it('skips a position whose search gave up, and searches it again on Try again', async () => {
    await render();
    const error = new Error('gave up');
    await act(async () => {
      void controllers[0].setError(getAnalysis, 'stockfish', [], error);
    });
    expect(mockSearched).toEqual(['', 'e2e4']);
    expect(reviews.at(-1)!.moves[0].status).toBe('failed');
    // 1.e4's label needs the start; 2.Nf3's needs none of the positions that gave up.
    expect(reviews.at(-1)!.failure(1)).toBe(error);
    expect(reviews.at(-1)!.failure(3)).toBeUndefined();
    await act(async () => reviews.at(-1)!.tryAgain(1));
    expect(reviews.at(-1)!.moves[0].status).toBe('waiting');
    expect(reviews.at(-1)!.failure(1)).toBeUndefined();
    expect(mockSearched.at(-1)).toBe('');
  });

  it('searches the move the board rests on, once it has rested about a second', async () => {
    await render();
    jest.useFakeTimers();
    await act(async () => reviews.at(-1)!.goto(3));
    await act(async () => {
      jest.advanceTimersByTime(999);
    });
    expect(reviews.at(-1)!.dwelt).toBeUndefined();
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    jest.useRealTimers();
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    // The position before 2.Nf3 first: its label needs it, then the one after.
    expect(mockSearched).toEqual(['', 'e2e4 e7e5']);
    expect(reviews.at(-1)!.visited).toEqual(new Set([3]));
  });

  it('starts afresh when the page is given another game', async () => {
    await render();
    await act(async () => reviews.at(-1)!.goto(3));
    await render(true, ['d2d4']);
    expect(reviews.at(-1)).toMatchObject({ ply: 0, visited: new Set() });
  });

  it('searches a try Stockfish did not list before its own next position, and shows it on the board', async () => {
    await render();
    // 2...Nc6 drops White's expected score from 0.45 to 0.7 for Black: a blunder.
    await final(3, ['g8f6', 0.45], ['d7d6', 0.5]);
    await final(4, ['f1b5', 0.7]);
    await act(async () => reviews.at(-1)!.goto(4));
    expect(reviews.at(-1)!.moment.canRetry).toBe(true);
    await act(async () => reviews.at(-1)!.retry());
    // Back one move, Black to play.
    expect(reviews.at(-1)!.current.turn).toBe('black');
    await act(async () => reviews.at(-1)!.play('a7a6'));
    expect(mockSearched.at(-1)).toBe('e2e4 e7e5 g1f3 a7a6');
    expect(reviews.at(-1)!.current.move?.san).toBe('a6');
    expect(reviews.at(-1)!.shownLine).toEqual(['e2e4', 'e7e5', 'g1f3', 'a7a6']);
  });

  it("shows the captures of the board's position on a retry, not the game's", async () => {
    // 1. e4 d5 2. exd5 Qxd5: a pawn each in the game.
    const traded = ['e2e4', 'd7d5', 'e4d5', 'd8d5'];
    await render(true, traded);
    expect(reviews.at(-1)!.captures.material.white.lead).toBe(0);
    // 2...Qxd5 drops White's expected score from 0.45 to 0.7 for Black: a blunder.
    await finalOf(traded, 3, ['g8f6', 0.45], ['c7c6', 0.5]);
    await finalOf(traded, 4, ['b1c3', 0.7]);
    await act(async () => reviews.at(-1)!.goto(4));
    await act(async () => reviews.at(-1)!.retry());
    // Back before 2...Qxd5: White is a pawn up, and only White has taken.
    const { captures } = reviews.at(-1)!;
    expect(captures.material.white).toEqual({ pieces: ['pawn'], lead: 1 });
    expect(captures.taken).toEqual({ white: ['pawn'], black: [] });
  });
});
