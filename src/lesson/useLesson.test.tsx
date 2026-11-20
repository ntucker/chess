import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { gameReducer, startGame } from '@/game/game';
import { DEFAULT_SETTINGS } from '@/settings/settings';

import type { Lesson as LessonFile } from './lesson';
import { keyAfter, readShippedLesson, SAMPLE, uciLine } from './lesson.fixture';
import { HOLD_MS } from './peek';
import { useLesson } from './useLesson';

// Labels, Stockfish's best move and progress read through Data Client
// (useLesson.engine.test.tsx covers the best move), the opponent runs
// an engine, and the screen's focus and Stockfish's demand come from the
// app's providers; these tests are about the Practice run. With auto play
// off nobody replies.
jest.mock('@/analysis/useMoveQualities', () => ({ useMoveQualities: () => [] }));
const mockFetch = jest.fn(async (..._args: unknown[]) => {});
jest.mock('@data-client/react', () => ({
  useController: () => ({ fetch: mockFetch }),
  useFetch: () => {},
  useCache: () => undefined,
  useSuspense: () => ({}),
}));
jest.mock('@/resources/evaluation', () => ({
  getEvaluation: {},
  getTopMoves: {},
}));
jest.mock('@/resources/opponent', () => ({
  gameOpponent: () => undefined,
  useWarmOpponent: () => {},
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@/stockfish/demand', () => ({ useNeedsStockfish: () => {} }));
const mockSettings = { ...DEFAULT_SETTINGS, auto: false };
jest.mock('@/settings/SettingsProvider', () => ({ useSettings: () => mockSettings }));

let root: Root | undefined;
/** What useLesson answered on each render; the latest last. */
const renders: ReturnType<typeof useLesson>[] = [];
const lesson = () => renders[renders.length - 1];

function Lesson({
  start,
  pending = false,
  of = SAMPLE,
}: {
  readonly start: readonly string[];
  readonly pending?: boolean;
  readonly of?: LessonFile;
}) {
  renders.push(useLesson(of, useReducer(gameReducer, start, startGame), { pending }));
  return null;
}

/** The Caro-Kann sample (the learner plays Black) after `sans`, in Explore. */
const exploreAfter = (...sans: string[]) =>
  act(async () => {
    root = createRoot();
    root.render(<Lesson start={uciLine(...sans)} />);
  });

/** The same while the game waits on another lesson still loading. */
const loadingAfter = (...sans: string[]) =>
  act(async () => {
    root = createRoot();
    root.render(<Lesson start={uciLine(...sans)} pending />);
  });

/** That lesson arrives. */
const loaded = (...sans: string[]) =>
  act(async () => root?.render(<Lesson start={uciLine(...sans)} />));

/** The same, in Practice. */
async function practiceAfter(...sans: string[]) {
  await exploreAfter(...sans);
  await act(async () => lesson().chooseMode('practice'));
}

const clean = () => {
  const { modeState } = lesson();
  return modeState.mode === 'practice' && modeState.clean;
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.length = 0;
  mockFetch.mockClear();
});

describe('useLesson Practice run', () => {
  it.each([
    ['slav', ['d4', 'd5', 'c4']],
    ['anti-london', ['d4', 'd5', 'Bf4']],
    ['london', ['d4']],
  ])("starts clean at %s's address, whose moves pick the opening", async (id, sans) => {
    await act(async () => {
      root = createRoot();
      root.render(<Lesson start={uciLine(...sans)} of={readShippedLesson(id)} />);
    });
    await act(async () => lesson().chooseMode('practice'));
    expect(clean()).toBe(true);
  });

  it('keeps the run clean when another opening is picked on the shared moves', async () => {
    const slav = readShippedLesson('slav');
    await act(async () => {
      root = createRoot();
      root.render(<Lesson start={uciLine('d4', 'd5', 'c4')} of={slav} />);
    });
    await act(async () => lesson().chooseMode('practice'));
    await act(async () => lesson().board.onMove('c7', 'c6'));
    expect(clean()).toBe(true);
    // Back on 1.d4 d5, 2.Bf4 picks the Anti-London: a choice, not a take-back.
    await act(async () => lesson().game.goto(2));
    await act(async () => lesson().board.onMove('c1', 'f4'));
    expect(lesson().game.moves).toEqual(uciLine('d4', 'd5', 'Bf4'));
    expect(clean()).toBe(true);
  });

  // 1...c6 picks the Caro-Kann among the 1.e4 lessons, so 2...d5 is the first move judged.
  it("starts again when the learner's first judged move is played again", async () => {
    await practiceAfter('e4', 'c6', 'd4', 'd5', 'e5');
    expect(clean()).toBe(false);
    await act(async () => lesson().game.goto(3));
    await act(async () => lesson().board.onMove('d7', 'd5'));
    expect(lesson().game.moves).toEqual(uciLine('e4', 'c6', 'd4', 'd5'));
    expect(clean()).toBe(true);
  });

  it("starts again when the learner's first judged move, the line's last, is played again", async () => {
    await practiceAfter('e4', 'c6', 'd4', 'd5');
    expect(clean()).toBe(false);
    await act(async () => lesson().game.goto(3));
    await act(async () => lesson().board.onMove('d7', 'd5'));
    expect(lesson().game.moves).toEqual(uciLine('e4', 'c6', 'd4', 'd5'));
    expect(clean()).toBe(true);
  });

  it('counts a move the game refused as no move, even from a board stepped away from', async () => {
    await practiceAfter('e4', 'c6', 'd4', 'd5', 'e5');
    await act(async () => lesson().game.goto(3));
    // Both from the same render: the drop was made on the board at move 3.
    const { game, board } = lesson();
    await act(async () => {
      game.goto(5);
      board.onMove('d7', 'd5');
    });
    expect(lesson().game).toMatchObject({ moves: uciLine('e4', 'c6', 'd4', 'd5', 'e5'), ply: 5 });
    expect(clean()).toBe(false);
  });

  it('counts a move where the game played it, not where it was dropped', async () => {
    await practiceAfter('e4', 'e6', 'd4');
    await act(async () => lesson().game.goto(1));
    const { game, board } = lesson();
    await act(async () => {
      game.goto(3);
      board.onMove('c7', 'c6');
    });
    expect(lesson().game.moves).toEqual(uciLine('e4', 'e6', 'd4', 'c6'));
    expect(clean()).toBe(false);
  });

  it('counts a slip that lands with the choice of Practice', async () => {
    await exploreAfter('e4');
    // Both from the same render, which showed a line with no move of the learner's.
    const { board, chooseMode } = lesson();
    await act(async () => {
      board.onMove('e7', 'e6');
      chooseMode('practice');
    });
    expect(lesson().game.moves).toEqual(uciLine('e4', 'e6'));
    expect(clean()).toBe(false);
  });
});

describe('useLesson while a lesson loads', () => {
  it('offers no move while the game waits on another lesson', async () => {
    await loadingAfter('e4');
    // The store would drop it, and the board would show a move the game hasn't.
    expect(lesson().canPlay).toBe(false);
    expect(lesson().board.movableColor).toBeUndefined();
    await loaded('e4');
    expect(lesson().canPlay).toBe(true);
    expect(lesson().board.movableColor).toBe('black');
  });

  it('keeps a row pressed after the mouse came onto it when the mouse reaches the idea card', async () => {
    await exploreAfter('e4', 'c6', 'd4', 'd5');
    const [first, second] = lesson().guidance.candidates.map(({ move }) => move.uci);
    await act(async () => lesson().pointRow(first, 0));
    await act(async () => lesson().pointRow(second, HOLD_MS));
    await act(async () => lesson().pointRow(second));
    await act(async () => lesson().reachCard(HOLD_MS + 10));
    expect(lesson().guidance.preview?.candidate.move.uci).toBe(second);
  });

  it('previews no row while the game waits on another lesson', async () => {
    await loadingAfter('e4');
    await act(async () => lesson().pointRow(uciLine('e4', 'c6')[1]));
    expect(lesson().guidance.preview).toBeUndefined();
    expect(lesson().board.preview).toBeUndefined();
    // The pointing is kept, so it previews once the lesson is shown.
    await loaded('e4');
    expect(lesson().guidance.preview?.candidate.san).toBe('c6');
    expect(lesson().board.preview).toBeDefined();
  });

  it('offers no idea to play back while the game waits on another lesson', async () => {
    const line = ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'];
    await loadingAfter(...line);
    const [note] = lesson().guidance.notes;
    expect(lesson().playback.playable(note)).toBeUndefined();
    await act(async () => lesson().playback.play(note));
    await loaded(...line);
    expect(lesson().playback.playing).toBeUndefined();
    expect(lesson().playback.playable(note)).toBe('plan');
  });
});

describe('useLesson progress', () => {
  /** The marks Explore saved, as `[mark, position key]`. */
  const saved = () =>
    mockFetch.mock.calls.map(([, args]) => {
      const { mark, key } = args as { mark: string; key: string };
      return [mark, key];
    });

  it('marks a position Explore shows', async () => {
    await exploreAfter('e4', 'c6');
    expect(saved()).toEqual([['seen', keyAfter('e4', 'c6')]]);
  });

  it('marks nothing at the start, whose rows are every lesson', async () => {
    await exploreAfter();
    expect(saved()).toEqual([]);
  });
});
