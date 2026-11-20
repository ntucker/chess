import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { gameReducer, startGame } from '@/game/game';
import { DEFAULT_SETTINGS } from '@/settings/settings';

import { SAMPLE, uciLine } from './lesson.fixture';
import { useLesson } from './useLesson';

// Labels, Stockfish's best move and progress read through Data Client
// (useLesson.engine.test.tsx covers the best move), the opponent runs
// an engine, and the screen's focus and Stockfish's demand come from the
// app's providers; these tests are about the Practice run. With auto play
// off nobody replies.
jest.mock('@/analysis/useMoveQualities', () => ({ useMoveQualities: () => [] }));
jest.mock('@data-client/react', () => ({
  useController: () => ({ fetch: async () => {} }),
  useFetch: () => {},
  useCache: () => undefined,
  useSuspense: () => ({ seen: [], passed: [] }),
}));
jest.mock('@/resources/evaluation', () => ({ getEvaluation: {} }));
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
}: {
  readonly start: readonly string[];
  readonly pending?: boolean;
}) {
  renders.push(useLesson(SAMPLE, useReducer(gameReducer, start, startGame), { pending }));
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
});

describe('useLesson Practice run', () => {
  it("starts again when the learner's first move is played again", async () => {
    await practiceAfter('e4', 'c6', 'd4');
    expect(clean()).toBe(false);
    await act(async () => lesson().game.goto(1));
    await act(async () => lesson().board.onMove('c7', 'c6'));
    expect(lesson().game.moves).toEqual(uciLine('e4', 'c6'));
    expect(clean()).toBe(true);
  });

  it("starts again when the learner's first move, the line's last, is played again", async () => {
    await practiceAfter('e4', 'c6');
    expect(clean()).toBe(false);
    await act(async () => lesson().game.goto(1));
    await act(async () => lesson().board.onMove('c7', 'c6'));
    expect(lesson().game.moves).toEqual(uciLine('e4', 'c6'));
    expect(clean()).toBe(true);
  });

  it('counts a move the game refused as no move, even from a board stepped away from', async () => {
    await practiceAfter('e4', 'c6', 'd4');
    await act(async () => lesson().game.goto(1));
    // Both from the same render: the drop was made on the board at move 1.
    const { game, board } = lesson();
    await act(async () => {
      game.goto(3);
      board.onMove('c7', 'c6');
    });
    expect(lesson().game).toMatchObject({ moves: uciLine('e4', 'c6', 'd4'), ply: 3 });
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
