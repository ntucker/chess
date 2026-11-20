// Practice runs are in useLesson.test.tsx, which stubs Data Client out.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, getDefaultManagers, useController } from '@data-client/react';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import type { Analysis } from '@/evaluation/evaluation';
import { gameReducer, startGame } from '@/game/game';
import { AnalysisManager, PositionAnalysis } from '@/resources/analysis';
import { LessonIndexContext } from '@/resources/lesson';

import { ADVANCE, SAMPLE, uciLine } from './lesson.fixture';
import { FIXTURE_INDEX } from './openings.fixture';
import { useLesson } from './useLesson';

// Every position Stockfish is asked to search, by the moves before it; none answers.
const mockSearched: string[] = [];
jest.mock('@/stockfish/engine', () => ({
  watchStockfish: (line: readonly string[]) => {
    mockSearched.push(line.join(' '));
    return () => {};
  },
}));
// Maia's engine needs a native worklet runtime; it's only warmed up here, since
// with auto play off nobody replies.
jest.mock('@/maia/engine', () => ({ maiaMove: () => new Promise(() => {}) }));
jest.mock('@/stockfish/demand', () => ({ useNeedsStockfish: () => {} }));
jest.mock('@/settings/SettingsProvider', () => {
  const { DEFAULT_SETTINGS } =
    jest.requireActual<typeof import('@/settings/settings')>('@/settings/settings');
  const settings = { ...DEFAULT_SETTINGS, auto: false };
  return { useSettings: () => settings };
});
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

// After Black's book move, so the move labels search neither position.
const LINE = uciLine('e4', 'c6');
const POSITION = LINE.join(' ');

let root: Root | undefined;
const managers = () => [new AnalysisManager(), ...getDefaultManagers()];
const controllers: Controller[] = [];
const renders: ReturnType<typeof useLesson>[] = [];
const lesson = () => renders.at(-1)!;

function Lesson({ moves }: { readonly moves: readonly string[] }) {
  controllers.push(useController());
  renders.push(useLesson(SAMPLE, useReducer(gameReducer, moves, startGame), { pending: false }));
  return null;
}

const render = (moves: readonly string[]) =>
  act(async () => {
    root ??= createRoot();
    root.render(
      <DataProvider managers={managers}>
        <LessonIndexContext value={FIXTURE_INDEX}>
          <Lesson moves={moves} />
        </LessonIndexContext>
      </DataProvider>,
    );
  });

/** Stores Stockfish's analysis of the position after `line`: its moves and White's expected score after each. */
const store = (line: readonly string[], lines: [string, number][], final = true) =>
  act(async () => {
    const args = { engine: 'stockfish', moves: line.join(' ') } as const;
    const analysis: Analysis = {
      lines: lines.map(([uci, score]) => ({ uci, evaluation: { score, pawns: 0 } })),
      depth: 18,
      final,
    };
    controllers[0].set(PositionAnalysis, args, { ...args, ...analysis });
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  mockSearched.length = 0;
  controllers.length = 0;
  renders.length = 0;
  mockFocused = true;
});

describe("useLesson's Stockfish best move", () => {
  it("asks Stockfish about the board's position in Explore", async () => {
    await render(LINE);
    expect(mockSearched).toEqual([POSITION]);
  });

  it('asks nothing while another screen is in front, nor in Practice', async () => {
    mockFocused = false;
    await render(LINE);
    expect(mockSearched).toEqual([]);
    await act(async () => lesson().chooseMode('practice'));
    mockFocused = true;
    await render(LINE);
    expect(mockSearched).toEqual([]);
  });

  it("hands Stockfish's best move to the guidance", async () => {
    const line = uciLine(...ADVANCE);
    await render(line);
    expect(lesson().guidance.best).toBeUndefined();
    // Its first line's move, outside the guide, once the search is final.
    await store(line, [['g8f6', 0.5]], false);
    expect(lesson().guidance.best).toBeUndefined();
    await store(line, [['g8f6', 0.5]]);
    expect(lesson().guidance.best).toBe('g8f6');
  });

  it('lists the top three only past the guide, from the same analysis', async () => {
    const line = uciLine(...ADVANCE, 'a6');
    await render(line);
    // One search of the board's position, beside the one before for a6's label.
    expect(mockSearched).toEqual([uciLine(...ADVANCE).join(' '), line.join(' ')]);
    await store(line, [
      ['c2c3', 0.6],
      ['g1f3', 0.58],
    ]);
    const { guidance } = lesson();
    expect(guidance.top.map(({ san }) => san)).toEqual(['c3', 'Nf3']);
    expect(guidance.best).toBe('c2c3');
    // Pointing at a row previews it, as a guide candidate's row does.
    await act(async () => lesson().pointRow('g1f3'));
    expect(lesson().guidance.preview?.candidate.san).toBe('Nf3');
    // Inside the guide, its analysis gives the best move but lists nothing.
    await store(uciLine(...ADVANCE), [
      ['c8f5', 0.45],
      ['c6c5', 0.47],
    ]);
    await act(async () => lesson().game.goto(5));
    expect(lesson().guidance.top).toEqual([]);
    expect(lesson().guidance.best).toBeUndefined();
  });

  it("draws a clicked piece's top moves and hides the resting best move", async () => {
    const line = uciLine(...ADVANCE, 'a6');
    await render(line);
    await store(line, [
      ['c2c3', 0.6],
      ['g1f3', 0.58],
    ]);
    expect(lesson().guidance.best).toBe('c2c3');
    await act(async () => lesson().board.onPress?.('g1'));
    expect(lesson().guidance.drawnCandidates.map(({ san }) => san)).toEqual(['Nf3']);
    expect(lesson().guidance.best).toBeUndefined();
    // A piece with none of the top moves still hides the resting arrow.
    await act(async () => lesson().board.onPress?.('b1', 'g1'));
    expect(lesson().guidance.drawnCandidates).toEqual([]);
    expect(lesson().guidance.best).toBeUndefined();
    // Clicking an empty square lets the piece go, and the arrow returns.
    await act(async () => lesson().board.onPress?.('a3', 'b1'));
    expect(lesson().guidance.best).toBe('c2c3');
    expect(lesson().guidance.drawnCandidates).toEqual([]);
    // Pointing at a row previews it; leaving the panel brings the piece's moves back.
    await act(async () => lesson().board.onPress?.('g1'));
    await act(async () => lesson().pointRow('c2c3'));
    expect(lesson().guidance.preview?.candidate.san).toBe('c3');
    await act(async () => lesson().leave());
    expect(lesson().guidance.drawnCandidates.map(({ san }) => san)).toEqual(['Nf3']);
    expect(lesson().guidance.best).toBeUndefined();
    // A drag that ends without a move lets it go.
    await act(async () => lesson().board.onDrag?.(null));
    expect(lesson().guidance.best).toBe('c2c3');
    // Clicking the selected piece again lets it go too, as the board does.
    await act(async () => lesson().board.onPress?.('g1'));
    expect(lesson().guidance.best).toBeUndefined();
    await act(async () => lesson().board.onPress?.('g1', 'g1'));
    expect(lesson().guidance.best).toBe('c2c3');
    expect(lesson().guidance.drawnCandidates).toEqual([]);
  });
});

describe("useLesson's move labels", () => {
  // Black's a6 is Stockfish's second move, 0.07 behind its first. Its h6
  // is unlisted, and the search after it rates it as well as the best, but
  // it can't be better than the list's last move, 0.06 behind.
  const LABELLED = uciLine(...ADVANCE, 'a6', 'c3', 'h6');
  const analyses = async () => {
    // Each other move is its position's first line.
    for (const ply of [0, 1, 2, 3, 4, 6])
      await store(LABELLED.slice(0, ply), [[LABELLED[ply], 0.5]]);
    await store(LABELLED.slice(0, 5), [
      ['c8f5', 0.4],
      ['a7a6', 0.47],
      ['c6c5', 0.48],
    ]);
    await store(LABELLED.slice(0, 7), [
      ['c8f5', 0.4],
      ['e7e6', 0.42],
      ['b7b5', 0.46],
    ]);
    await store(LABELLED, [['g1f3', 0.4]]);
  };

  it('labels the same game the same in Explore, in Practice, and stepping back', async () => {
    await render(LABELLED);
    await analyses();
    const explore = lesson().game.qualities;
    expect(explore.slice(5)).toEqual(['inaccuracy', 'best', 'inaccuracy']);
    await act(async () => lesson().chooseMode('practice'));
    expect(lesson().game.qualities).toEqual(explore);
    await act(async () => lesson().game.goto(3));
    expect(lesson().game.qualities).toEqual(explore);
  });

  it('labels nothing from a search that is still deepening', async () => {
    await render(LABELLED);
    await store(
      LABELLED.slice(0, 5),
      [
        ['c8f5', 0.4],
        ['a7a6', 0.47],
      ],
      false,
    );
    expect(lesson().game.qualities[5]).toBeUndefined();
    await store(LABELLED.slice(0, 5), [
      ['c8f5', 0.4],
      ['a7a6', 0.47],
    ]);
    expect(lesson().game.qualities[5]).toBe('inaccuracy');
  });
});
