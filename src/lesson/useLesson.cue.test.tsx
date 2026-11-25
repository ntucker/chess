import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { haptic } from '@/components/haptics';
import { gameReducer, startGame } from '@/game/game';
import { readPositionKey, sanToUci } from '@/game/replay';
import { LessonIndexContext } from '@/resources/lesson';
import { DEFAULT_SETTINGS } from '@/settings/settings';

import { readShippedLesson, uciLine } from './lesson.fixture';
import { FIXTURE_INDEX } from './openings.fixture';
import { lineKeys } from './select';
import { useLesson } from './useLesson';

// What useLesson reads besides the lesson and the game is stood in for
// (useLesson.fixture.ts), but for the engine past the guide, which never answers.
type StandIns = typeof import('@/lesson/useLesson.fixture');
function mockStandIns() {
  return jest.requireActual<StandIns>('@/lesson/useLesson.fixture');
}
const mockSettings = { ...DEFAULT_SETTINGS, auto: true };
jest.mock('@/analysis/useMoveQualities', () => mockStandIns().moveQualities);
jest.mock('@/resources/analysis', () => mockStandIns().analysis);
jest.mock('@/resources/opponent', () => ({
  ...mockStandIns().opponent,
  gameOpponent: () => ({
    id: 'engine',
    reply: () => Promise.reject(new Error('No engine in tests')),
  }),
}));
jest.mock('expo-router', () => mockStandIns().router);
jest.mock('@/stockfish/demand', () => mockStandIns().demand);
jest.mock('@/components/haptics', () => ({ haptic: jest.fn() }));
jest.mock('@data-client/react', () => mockStandIns().dataClient(() => ({ fetch: async () => {} })));
jest.mock('@/settings/SettingsProvider', () => mockStandIns().settingsProvider(() => mockSettings));

// Black's Berlin: White's 5.Nxe5? is marked, punished by 5...c6 6.Bc4 Qa5+.
const BERLIN = readShippedLesson('berlin');
const CUE = uciLine('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'd3', 'Ne7', 'Nxe5');
const CUE_KEY = lineKeys(CUE).at(-1)!;
const at = (san: string) => sanToUci(readPositionKey(CUE_KEY)!, san)!;

let root: Root | undefined;
const renders: ReturnType<typeof useLesson>[] = [];
const lesson = () => renders[renders.length - 1];

function Lesson({ line = CUE }: { readonly line?: readonly string[] }) {
  renders.push(useLesson(BERLIN, useReducer(gameReducer, line, startGame), { pending: false }));
  return null;
}

/** The opponent's least thinking time (`THINKING_MS` in useGame), and a little more. */
const replyTime = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

/** Opens the lesson at the cue, or at `line`. */
async function atCue(line?: readonly string[]) {
  await act(async () => {
    root = createRoot();
    root.render(
      <LessonIndexContext value={FIXTURE_INDEX}>
        <Lesson line={line} />
      </LessonIndexContext>,
    );
  });
}

/** The learner drops a piece for `san`, at the cue, as the board reports it. */
const play = (san: string) =>
  act(async () => {
    const uci = at(san);
    lesson().board.onMove?.(uci.slice(0, 2) as never, uci.slice(2, 4) as never);
  });

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.length = 0;
  jest.mocked(haptic).mockClear();
});

describe('useLesson at a cue', () => {
  it('shows its acts in Explore beside every hint', async () => {
    await atCue();
    expect(lesson().guidance.acts).toMatchObject({ found: false, payoff: 'ahead' });
    expect(lesson().guidance.candidates.length).toBeGreaterThan(0);
    expect(lesson().canPlay).toBe(true);
  });

  it("plays the payoff: the opponent answers along the line after the line's reply", async () => {
    await atCue();
    await play('c6');
    await replyTime();
    expect(lesson().game.moves.slice(9)).toEqual([at('c6'), BERLIN_BC4]);
    expect(lesson().guidance.acts).toMatchObject({ found: true, payoff: 'playing' });
    // The mistake's note shows in the acts, not on a trap card.
    expect(lesson().guidance.trapIn).toBe('cue');
  });

  it('holds nothing at a move off the line: the opponent answers, and the acts end', async () => {
    await atCue();
    await play('a6');
    await replyTime();
    expect(lesson().guidance.acts).toBeUndefined();
    // Past the guide the engine answers, which fails here: it was asked.
    expect(lesson().game.error).toBeDefined();
  });

  it("names nothing in Practice before the learner's move, and shows a miss after it", async () => {
    await atCue();
    await act(async () => lesson().chooseMode('practice'));
    expect(lesson().guidance.acts).toBeUndefined();
    expect(lesson().guidance.opportunity).toBeUndefined();
    await play('a6');
    expect(lesson().guidance.opportunity).toMatchObject({ found: false, tried: at('a6') });
  });

  it('ticks when the opponent plays the mistake', async () => {
    // A move before the cue, the opponent's most played is the mistake, 5.Nxe5.
    await atCue(CUE.slice(0, -1));
    await replyTime();
    expect(lesson().game.moves).toEqual(CUE);
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('moveLanded');
  });

  it('stays still opening at the cue, and stepping back onto it', async () => {
    await atCue();
    expect(haptic).not.toHaveBeenCalled();
    await play('c6');
    jest.mocked(haptic).mockClear();
    await act(async () => lesson().game.goto(9));
    expect(haptic).not.toHaveBeenCalled();
  });
});

/** White's 6.Bc4 after 5...c6: the line's move, which the band's most played may not be. */
const BERLIN_BC4 = uciLine(
  'e4',
  'e5',
  'Nf3',
  'Nc6',
  'Bb5',
  'Nf6',
  'd3',
  'Ne7',
  'Nxe5',
  'c6',
  'Bc4',
).at(-1)!;
