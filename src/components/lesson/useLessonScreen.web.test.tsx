import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, useReducer } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { gameReducer, startGame } from '@/game/game';
import type { Lesson } from '@/lesson/lesson';
import { uciLine } from '@/lesson/lesson.fixture';
import { FIXTURE_INDEX, FIXTURE_LESSONS } from '@/lesson/openings.fixture';
import { LessonIndexContext } from '@/resources/lesson';
import { DEFAULT_SETTINGS } from '@/settings/settings';

import { type LessonScreenModel, useLessonScreen } from './useLessonScreen';

// What useLesson reads besides the lesson and the game is stood in for
// (useLesson.testing.ts), and nobody replies with auto play off: these tests
// are about what the screen shows, not about the engines.
type StandIns = typeof import('@/lesson/useLesson.testing');
function mockStandIns() {
  return jest.requireActual<StandIns>('@/lesson/useLesson.testing');
}
jest.mock('@/analysis/useMoveQualities', () => mockStandIns().moveQualities);
jest.mock('@/resources/analysis', () => mockStandIns().analysis);
jest.mock('@/resources/opponent', () => mockStandIns().opponent);
jest.mock('expo-router', () => mockStandIns().router);
jest.mock('@/stockfish/demand', () => mockStandIns().demand);
const mockFetchIfStale = jest.fn((..._args: unknown[]) => {});
jest.mock('@data-client/react', () =>
  mockStandIns().dataClient(() => ({ fetch: async () => {}, fetchIfStale: mockFetchIfStale })),
);
const mockSettings = { ...DEFAULT_SETTINGS, auto: false };
jest.mock('@/settings/SettingsProvider', () => mockStandIns().settingsProvider(() => mockSettings));

const CARO_KANN = FIXTURE_LESSONS['caro-kann'] as Lesson;
const onPlayAs = jest.fn();
let root: Root | undefined;
/** What the hook answered on each render; the latest last. */
const renders: LessonScreenModel[] = [];

function Screen({ picked, start }: { readonly picked?: Lesson; readonly start: string[] }) {
  renders.push(
    useLessonScreen({
      id: picked && 'caro-kann',
      picked,
      side: 'black',
      onPlayAs,
      store: useReducer(gameReducer, start, startGame),
      pending: false,
      loading: false,
    }),
  );
  return null;
}

/** The screen after `sans`, at the start (`picked` none) or in the Caro-Kann sample. */
const showAfter = (picked: Lesson | undefined, ...sans: string[]) =>
  act(async () => {
    root = createRoot();
    root.render(
      <LessonIndexContext value={FIXTURE_INDEX}>
        <Screen picked={picked} start={uciLine(...sans)} />
      </LessonIndexContext>,
    );
  });

const shown = () => renders[renders.length - 1];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  renders.length = 0;
  onPlayAs.mockClear();
  mockFetchIfStale.mockClear();
});

describe('useLessonScreen', () => {
  it('shows the openings of the side at the start, each row keeping where it leads', async () => {
    await showAfter(undefined);
    const { header, moves, board, stepper, review, title } = shown();
    expect(header.place).toEqual({ name: 'Openings' });
    expect(header.placeLink?.href).toEqual({ pathname: '/openings', params: {} });
    expect(title).toBe('Openings · Opening Night');
    expect(moves).toMatchObject({ heading: 'first move', owner: 'White', compact: false });
    expect(moves!.candidates.map((row) => moves!.leadsTo(row))).toContain('Caro-Kann Defence');
    expect(stepper).toEqual({ san: undefined, ply: 0, started: false });
    expect(review.offered).toBe(false);
    // Until a line picks a lesson, the name bars' discs swap the side.
    board.onSwap!();
    expect(onPlayAs).toHaveBeenCalledWith('white');
  });

  it("loads the lesson a pointed row opens, so playing it needn't wait", async () => {
    await showAfter(undefined);
    const { moves } = shown();
    const caroKann = moves!.candidates.find((row) => moves!.leadsTo(row) === 'Caro-Kann Defence')!;
    await act(async () => moves!.onPoint(caroKann.move.uci));
    expect(mockFetchIfStale).toHaveBeenCalledWith(expect.anything(), 'caro-kann');
  });

  it("shows the lesson's line once picked, with compact rows and no swap", async () => {
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4');
    const { header, moves, board, idea, learner, scoresheet } = shown();
    expect(header.place).toEqual({ name: 'Caro-Kann Defence', parent: undefined });
    expect(header.placeLink?.href).toMatchObject({ params: { lesson: 'caro-kann' } });
    expect(moves).toMatchObject({ heading: 'Your candidates', owner: undefined, compact: true });
    expect(board.onSwap).toBeUndefined();
    expect(board.rival.name).toBe('White');
    expect(learner).toBe('black');
    expect(idea?.title).toBe('The idea');
    expect(scoresheet.ply).toBe(3);
  });

  it("names the rival's moves as likely replies, with whose they are", async () => {
    await showAfter(CARO_KANN, 'e4', 'c6');
    expect(shown().moves).toMatchObject({ heading: 'likely replies', owner: 'White' });
  });

  it('takes the headline from the status and links its eyebrow to every opening', async () => {
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4');
    const { headline, header } = shown();
    expect(headline).toMatchObject({ eyebrow: 'Caro-Kann Defence', title: 'Your move.' });
    expect(headline).not.toHaveProperty('pastGuide');
    // Once the learner has moved, a narrow page draws no "your move" line.
    expect(shown().news).toEqual({ panes: 'none', scoresheet: 'none' });
    expect(headline.failure).toBeUndefined();
    expect(headline.eyebrowLink).toBe(header.placeLink);
  });
});
