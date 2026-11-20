// Practice runs are in useLesson.test.tsx, which stubs Data Client out.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, useController } from '@data-client/react';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { gameReducer, startGame } from '@/game/game';
import { getEvaluation } from '@/resources/evaluation';

import { SAMPLE, uciLine } from './lesson.fixture';
import { useLesson } from './useLesson';

// Every search started, by the moves before the position; none answers.
const mockSearched: string[] = [];
jest.mock('@/stockfish/engine', () => ({
  stockfishEvaluation: (line: readonly string[]) => {
    mockSearched.push(line.join(' '));
    return new Promise(() => {});
  },
}));
// Maia's engine needs a native worklet runtime; with auto play off nobody replies.
jest.mock('@/maia/engine', () => ({}));
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
      <DataProvider>
        <Lesson moves={moves} />
      </DataProvider>,
    );
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
    const line = uciLine('e4', 'c6', 'Qh5');
    await render(line);
    expect(lesson().guidance.best).toBeUndefined();
    await act(async () => {
      controllers[0].setResponse(getEvaluation, 'stockfish', line, {
        score: 0.5,
        pawns: 0,
        best: 'g8f6',
      });
    });
    expect(lesson().guidance.best).toBe('g8f6');
  });
});
