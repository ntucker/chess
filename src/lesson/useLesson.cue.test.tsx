import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { haptic } from '@/components/haptics';
import type { FinalAnalysis } from '@/evaluation/evaluation';
import { gameReducer, startGame } from '@/game/game';
import { readPositionKey, sanToUci } from '@/game/replay';
import { LessonIndexContext } from '@/resources/lesson';
import { DEFAULT_SETTINGS } from '@/settings/settings';

import { readShippedLesson, uciLine } from './lesson.fixture';
import { FIXTURE_INDEX } from './openings.fixture';
import { lineKeys } from './select';
import { useLesson } from './useLesson';

// What useLesson reads besides the lesson and the game is stood in for
// (useLesson.fixture.ts), but for Stockfish's final answers, which these
// tests set (`finals`), and the engine past the guide, which never answers.
type StandIns = typeof import('@/lesson/useLesson.fixture');
function mockStandIns() {
  return jest.requireActual<StandIns>('@/lesson/useLesson.fixture');
}
const mockFinals = new Map<string, FinalAnalysis>();
const mockSettings = { ...DEFAULT_SETTINGS, auto: true };
jest.mock('@/analysis/useMoveQualities', () => mockStandIns().moveQualities);
jest.mock('@/resources/analysis', () => ({
  ...mockStandIns().analysis,
  storedAnalyses: (_ctrl: unknown, _engine: unknown, lines: readonly (readonly string[])[]) =>
    lines.map((line) => mockFinals.get(line.join(' '))),
}));
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
  // The cue's final analysis: 5...c6 best, then 5...Nc6.
  const pos = readPositionKey(CUE_KEY)!;
  mockFinals.set(CUE.join(' '), {
    lines: [
      { uci: sanToUci(pos.clone(), 'c6')!, evaluation: { score: 0.25, pawns: 0 } },
      { uci: sanToUci(pos.clone(), 'Nc6')!, evaluation: { score: 0.3, pawns: 0 } },
    ],
    depth: 18,
    final: true,
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.length = 0;
  mockFinals.clear();
  jest.mocked(haptic).mockClear();
});

describe('useLesson at a cue', () => {
  it('asks at the cue, hiding every hint', async () => {
    await atCue();
    expect(lesson().acts).toMatchObject({ found: 'open', live: true });
    expect(lesson().guidance.candidates).toEqual([]);
    expect(lesson().guidance.notes).toEqual([]);
  });

  it("passes the line's reply, and the opponent answers along the line", async () => {
    await atCue();
    await play('c6');
    await replyTime();
    expect(lesson().game.moves.slice(9)).toEqual([at('c6'), BERLIN_BC4]);
    expect(lesson().acts).toMatchObject({ found: 'passed', payoff: 'playing' });
    // The mistake's note shows in the acts, not on a trap card.
    expect(lesson().guidance.trapIn).toBe('acts');
  });

  it('holds the opponent at a wrong try, and Retry goes back to the cue', async () => {
    await atCue();
    await play('a6');
    await replyTime();
    expect(lesson().game.moves).toHaveLength(10);
    expect(lesson().acts).toMatchObject({ found: 'failed', held: true });
    // Nor can the learner play the opponent's move for it.
    expect(lesson().canPlay).toBe(false);
    await act(async () => lesson().retryCue());
    expect(lesson().game.ply).toBe(9);
    expect(lesson().acts).toMatchObject({ found: 'open', live: true });
  });

  it('ticks when the opponent plays the mistake', async () => {
    // A move before the cue, the opponent's most played is the mistake, 5.Nxe5.
    await atCue(CUE.slice(0, -1));
    await replyTime();
    expect(lesson().game.moves).toEqual(CUE);
    expect(haptic).toHaveBeenCalledTimes(1);
    expect(haptic).toHaveBeenCalledWith('moveLanded');
  });

  it('stays still opening at the cue, and coming back to it', async () => {
    await atCue();
    expect(haptic).not.toHaveBeenCalled();
    await play('a6');
    jest.mocked(haptic).mockClear();
    await act(async () => lesson().retryCue());
    expect(haptic).not.toHaveBeenCalled();
  });

  it('lets the opponent answer once a wrong try is skipped', async () => {
    await atCue();
    await play('a6');
    await act(async () => lesson().skipCue());
    await replyTime();
    expect(lesson().acts).toBeUndefined();
    // Past the guide the engine answers, which fails here: it was asked.
    expect(lesson().game.error).toBeDefined();
  });

  it('waits, unmovable, on a listed move until the position before is judged', async () => {
    await atCue();
    await play('Nc6');
    expect(lesson().acts).toMatchObject({ found: 'pending', held: true });
    expect(lesson().canPlay).toBe(false);
  });

  it('shows the reply on the board, back at the cue', async () => {
    await atCue();
    await play('a6');
    await act(async () => lesson().showCue());
    expect(lesson().game.ply).toBe(9);
    expect(lesson().acts).toMatchObject({ found: 'shown', live: true });
    expect(lesson().guidance.candidates.map(({ san }) => san)).toEqual(['c6']);
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
