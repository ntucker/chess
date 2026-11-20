import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, useController } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { Evaluation, TopMove } from '@/evaluation/evaluation';
import { replay } from '@/game/replay';
import { getEvaluation, getTopMoves } from '@/resources/evaluation';
import { evaluationFromScore } from '@/stockfish/uci';

import type { MoveQuality } from './quality';
import { useMoveQualities } from './useMoveQualities';

// Every search the hook starts, by the moves before the position; none answers.
const mockSearched: string[] = [];
jest.mock('@/stockfish/engine', () => ({
  stockfishEvaluation: (line: readonly string[]) => {
    mockSearched.push(line.join(' '));
    return new Promise(() => {});
  },
}));

// Maia's engine needs a native worklet runtime; these tests judge with Stockfish.
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));

const MOVES = ['e2e4', 'e7e5', 'g1f3'];
const PLIES = replay(MOVES);
const scored = (score: number): Evaluation => ({ score, pawns: 0 });
/** How Stockfish reports `centipawns` for the side to move after `plies` moves. */
const cp = (centipawns: number, plies: number) =>
  evaluationFromScore({ kind: 'cp', value: centipawns }, plies);

let root: Root | undefined;
const controllers: Controller[] = [];
const renders: (readonly (MoveQuality | undefined)[])[] = [];

function Labels({ shown, book }: { readonly shown: number; readonly book?: boolean[] }) {
  controllers.push(useController());
  renders.push(useMoveQualities(PLIES, shown, 'stockfish', book));
  return null;
}

const render = (shown: number, book?: boolean[]) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider>
        <Labels shown={shown} book={book} />
      </DataProvider>,
    );
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.length = 0;
  controllers.length = 0;
  mockSearched.length = 0;
});

describe('useMoveQualities', () => {
  it('asks only for the positions around the shown move', async () => {
    await render(2);
    expect(mockSearched.sort()).toEqual(['e2e4', 'e2e4 e7e5']);
  });

  it('asks for nothing at the starting position', async () => {
    await render(0);
    expect(mockSearched).toEqual([]);
    expect(renders.at(-1)).toEqual([undefined, undefined, undefined]);
  });

  it('labels each move once both its positions are known, not only the shown one', async () => {
    await render(3);
    const [ctrl] = controllers;
    await act(async () => {
      // White's move changes nothing; Black's gives a quarter of the expected score away.
      ctrl.setResponse(getEvaluation, 'stockfish', [], scored(0.5));
      ctrl.setResponse(getEvaluation, 'stockfish', ['e2e4'], scored(0.5));
      ctrl.setResponse(getEvaluation, 'stockfish', ['e2e4', 'e7e5'], scored(0.75));
    });
    expect(renders.at(-1)).toEqual(['best', 'blunder', undefined]);
  });

  it('labels book moves without asking the engine', async () => {
    await render(2, [false, true, false]);
    expect(mockSearched).toEqual([]);
    expect(renders.at(-1)).toEqual([undefined, 'book', undefined]);
  });

  // Stockfish's own numbers from a Semi-Slav (after 10.O-O, Noteboom): its
  // evaluation favoured a5 by 1.29, its top moves listed Bb7 first at 1.12,
  // and the evaluation after Bb7 gave Black only 0.56: an inaccuracy by the
  // evaluations, though the list called Bb7 the best.
  it('labels a move Stockfish listed from the list, even where its evaluations disagree', async () => {
    await render(3);
    const [ctrl] = controllers;
    const top: TopMove[] = [
      { uci: 'e7e5', evaluation: cp(112, 1) },
      { uci: 'c7c5', evaluation: cp(101, 1) },
      { uci: 'e7e6', evaluation: cp(71, 1) },
    ];
    await act(async () => {
      ctrl.setResponse(getEvaluation, 'stockfish', ['e2e4'], { ...cp(129, 1), best: 'c7c5' });
      ctrl.setResponse(getEvaluation, 'stockfish', ['e2e4', 'e7e5'], cp(-56, 2));
    });
    expect(renders.at(-1)?.[1]).toBe('inaccuracy');
    await act(async () => {
      ctrl.setResponse(getTopMoves, ['e2e4'], top);
    });
    expect(renders.at(-1)?.[1]).toBe('best');
  });

  it("labels a listed move by how far its listed score falls short of the first's", async () => {
    await render(3);
    const [ctrl] = controllers;
    await act(async () => {
      ctrl.setResponse(
        getTopMoves,
        ['e2e4'],
        [
          { uci: 'c7c5', evaluation: cp(40, 1) },
          { uci: 'e7e5', evaluation: cp(-30, 1) },
        ],
      );
    });
    // Listed 0.7 pawns behind; no evaluation is needed.
    expect(renders.at(-1)?.[1]).toBe('inaccuracy');
  });
});
