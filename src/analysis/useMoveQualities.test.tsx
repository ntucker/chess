import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, useController } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { Evaluation } from '@/evaluation/evaluation';
import { replay } from '@/game/replay';
import { getEvaluation } from '@/resources/evaluation';

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

let root: Root | undefined;
const controllers: Controller[] = [];
const renders: (readonly (MoveQuality | undefined)[])[] = [];

function Labels({ shown }: { readonly shown: number }) {
  controllers.push(useController());
  renders.push(useMoveQualities(PLIES, shown, 'stockfish'));
  return null;
}

const render = (shown: number) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider>
        <Labels shown={shown} />
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
});
