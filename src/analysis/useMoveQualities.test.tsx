import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, getDefaultManagers, useController } from '@data-client/react';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { Analysis } from '@/evaluation/evaluation';
import { replay } from '@/game/replay';
import { AnalysisManager, PositionAnalysis } from '@/resources/analysis';
import { evaluationFromScore } from '@/stockfish/uci';

import { type MoveJudgements, useMoveQualities } from './useMoveQualities';

// Every position the hook has Stockfish search, by the moves before it; none answers.
const mockSearched: string[] = [];
jest.mock('@/stockfish/engine', () => ({
  liteStockfish: {
    watch: (line: readonly string[]) => {
      mockSearched.push(line.join(' '));
      return () => {};
    },
  },
}));

// Maia's engine needs a native worklet runtime; these tests judge with Stockfish.
jest.mock('@/maia/engine', () => ({ maiaEvaluation: jest.fn() }));

const MOVES = ['e2e4', 'e7e5', 'g1f3'];
const PLIES = replay(MOVES);
/** How Stockfish reports `centipawns` for the side to move after `plies` moves. */
const cp = (centipawns: number, plies: number) =>
  evaluationFromScore({ kind: 'cp', value: centipawns }, plies);
/** An analysis of the position after `plies` moves: its moves and their centipawns, best first. */
const analysis = (plies: number, lines: [string, number][], final = true): Analysis => ({
  lines: lines.map(([uci, centipawns]) => ({ uci, evaluation: cp(centipawns, plies) })),
  depth: 18,
  final,
});

let root: Root | undefined;
const controllers: Controller[] = [];
const renders: MoveJudgements[] = [];
/** The last render's labels. */
const labels = () => renders.at(-1)?.qualities;
const managers = () => [new AnalysisManager(), ...getDefaultManagers()];

function Labels({ shown, book }: { readonly shown: number | null; readonly book?: boolean[] }) {
  controllers.push(useController());
  renders.push(useMoveQualities(PLIES, shown, 'stockfish', book));
  return null;
}

const render = (shown: number | null, book?: boolean[]) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider managers={managers}>
        <Labels shown={shown} book={book} />
      </DataProvider>,
    );
  });

/** Stores Stockfish's analysis of the position after `moves`. */
const store = (moves: string[], value: Analysis) =>
  act(async () => {
    const args = { engine: 'stockfish', moves: moves.join(' ') } as const;
    controllers[0].set(PositionAnalysis, args, { ...args, ...value });
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
  it('asks only for the positions around the shown move, the shown one last', async () => {
    await render(2);
    expect(mockSearched).toEqual(['e2e4', 'e2e4 e7e5']);
  });

  it('asks for nothing at the starting position', async () => {
    await render(0);
    expect(mockSearched).toEqual([]);
    expect(labels()).toEqual([undefined, undefined, undefined]);
  });

  it('asks for nothing behind another screen, then for the positions around the shown move', async () => {
    await render(null);
    expect(mockSearched).toEqual([]);
    await render(3);
    expect(mockSearched).toEqual(['e2e4 e7e5', 'e2e4 e7e5 g1f3']);
  });

  it('labels each move once its analyses are final, not only the shown one', async () => {
    await render(3);
    // White's e4 is the best; Black's e5 is not listed, and gives away a lot.
    await store(
      [],
      analysis(0, [
        ['e2e4', 30],
        ['d2d4', 25],
        ['g1f3', 20],
      ]),
    );
    await store(
      ['e2e4'],
      analysis(1, [
        ['c7c5', 40],
        ['c7c6', 30],
        ['e7e6', 20],
      ]),
    );
    await store(['e2e4', 'e7e5'], analysis(2, [['g1f3', 250]], false));
    // e5's position is still being searched: no label yet.
    expect(labels()).toEqual(['best', undefined, undefined]);
    // Once it's final, it judges e5, and lists Nf3 first: the best.
    await store(['e2e4', 'e7e5'], analysis(2, [['g1f3', 250]]));
    expect(labels()).toEqual(['best', 'blunder', 'best']);
  });

  it('labels book moves without asking the engine', async () => {
    await render(2, [false, true, false]);
    expect(mockSearched).toEqual([]);
    expect(labels()).toEqual([undefined, 'book', undefined]);
  });

  // Stockfish's own numbers from a Semi-Slav (after 10.O-O, Noteboom), put on
  // 1.e4 here with e5 for Bb7: listed 0.08 pawns behind the best, though the
  // search after Bb7 gave Black 0.73 less. The list decides.
  it('labels a listed move from its own line, whatever the position after says', async () => {
    await render(3);
    await store(
      ['e2e4'],
      analysis(1, [
        ['c7c5', 111],
        ['e7e5', 103],
        ['e7e6', 103],
      ]),
    );
    expect(labels()?.[1]).toBe('good');
    await store(['e2e4', 'e7e5'], analysis(2, [['g1f3', -38]]));
    expect(labels()?.[1]).toBe('good');
  });

  it('names the reply that punishes a mistake, from the analysis that labels it', async () => {
    await render(2);
    await store(['e2e4'], analysis(1, [['c7c5', 40]]));
    // After e5, White's Nf3 is far ahead of its second line.
    await store(
      ['e2e4', 'e7e5'],
      analysis(2, [
        ['g1f3', 250],
        ['d2d4', 60],
      ]),
    );
    expect(renders.at(-1)).toMatchObject({
      qualities: [undefined, 'blunder', 'best'],
      refutations: [undefined, 'g1f3', undefined],
    });
  });
});
