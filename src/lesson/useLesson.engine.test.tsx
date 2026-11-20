// Practice runs are in useLesson.test.tsx, which stubs Data Client out.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Controller, DataProvider, useController } from '@data-client/react';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { gameReducer, startGame } from '@/game/game';
import { getEvaluation, getTopMoves } from '@/resources/evaluation';

import { ADVANCE, SAMPLE, uciLine } from './lesson.fixture';
import { useLesson } from './useLesson';

// Every search started, by the moves before the position (top moves marked
// "top"); none answers.
const mockSearched: string[] = [];
jest.mock('@/stockfish/engine', () => ({
  stockfishEvaluation: (line: readonly string[]) => {
    mockSearched.push(line.join(' '));
    return new Promise(() => {});
  },
  stockfishTopMoves: (line: readonly string[]) => {
    mockSearched.push(`top ${line.join(' ')}`);
    return new Promise(() => {});
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
    const line = uciLine(...ADVANCE);
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

  it('asks for the top three only past the guide, and lists them there', async () => {
    const line = uciLine(...ADVANCE, 'a6');
    await render(line);
    const position = line.join(' ');
    // Beside the evaluations the board and a6's label ask for.
    expect(mockSearched.filter((search) => search.startsWith('top'))).toEqual([`top ${position}`]);
    await act(async () => {
      controllers[0].setResponse(getTopMoves, line, [
        { uci: 'c2c3', evaluation: { score: 0.6, pawns: 0.6 } },
        { uci: 'g1f3', evaluation: { score: 0.58, pawns: 0.5 } },
      ]);
    });
    const { guidance } = lesson();
    expect(guidance.top.map(({ san }) => san)).toEqual(['c3', 'Nf3']);
    expect(guidance.best).toBe('c2c3');
    // Pointing at a row previews it, as a guide candidate's row does.
    await act(async () => lesson().pointRow('g1f3'));
    expect(lesson().guidance.preview?.candidate.san).toBe('Nf3');
  });

  it("draws a clicked piece's top moves and hides the resting best move", async () => {
    const line = uciLine(...ADVANCE, 'a6');
    await render(line);
    await act(async () => {
      controllers[0].setResponse(getTopMoves, line, [
        { uci: 'c2c3', evaluation: { score: 0.6, pawns: 0.6 } },
        { uci: 'g1f3', evaluation: { score: 0.58, pawns: 0.5 } },
      ]);
    });
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
  });
});
