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
// (useLesson.fixture.ts), and nobody replies with auto play off: these tests
// are about what the screen shows, not about the engines.
type StandIns = typeof import('@/lesson/useLesson.fixture');
function mockStandIns() {
  return jest.requireActual<StandIns>('@/lesson/useLesson.fixture');
}
jest.mock('@/analysis/useMoveQualities', () => mockStandIns().moveQualities);
jest.mock('@/resources/analysis', () => mockStandIns().analysis);
jest.mock('@/resources/opponent', () => mockStandIns().opponent);
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/stockfish/demand', () => mockStandIns().demand);
// The finder finds nothing; what it is asked is recorded.
const mockUseFinder = jest.fn((_ask: unknown) => ({ finds: [], running: false }));
jest.mock('@/opportunity/useFinder', () => ({ useFinder: (ask: unknown) => mockUseFinder(ask) }));
const mockFetchIfStale = jest.fn((..._args: unknown[]) => {});
// The device's accounts (`getAccounts`): none unless a test signs in.
let mockAccounts: object | undefined;
jest.mock('@data-client/react', () => ({
  ...mockStandIns().dataClient(() => ({ fetch: async () => {}, fetchIfStale: mockFetchIfStale })),
  useDLE: () => ({ data: mockAccounts }),
}));
const mockSettings = { ...DEFAULT_SETTINGS, auto: false };
jest.mock('@/settings/SettingsProvider', () => mockStandIns().settingsProvider(() => mockSettings));

const CARO_KANN = FIXTURE_LESSONS['caro-kann'] as Lesson;
const onPlayAs = jest.fn();
let root: Root | undefined;
/** What the hook answered on each render; the latest last. */
const renders: LessonScreenModel[] = [];

function Screen({
  picked,
  start,
  pendingMove,
}: {
  readonly picked?: Lesson;
  readonly start: string[];
  /** A pick's move whose lesson has been loading long enough to say so. */
  readonly pendingMove?: string;
}) {
  renders.push(
    useLessonScreen({
      id: picked && 'caro-kann',
      picked,
      side: 'black',
      onPlayAs,
      store: useReducer(gameReducer, start, startGame),
      pending: pendingMove !== undefined,
      pendingMove,
      loading: pendingMove !== undefined,
    }),
  );
  return null;
}

/** The screen after `sans`, at the start (`picked` none) or in the Caro-Kann sample. */
const showAfter = (picked: Lesson | undefined, ...sans: string[]) =>
  showWaiting(undefined, picked, ...sans);

/** As `showAfter`, while the lesson `pendingMove` picked loads. */
const showWaiting = (
  pendingMove: string | undefined,
  picked: Lesson | undefined,
  ...sans: string[]
) =>
  act(async () => {
    root = createRoot();
    root.render(
      <LessonIndexContext value={FIXTURE_INDEX}>
        <Screen picked={picked} start={uciLine(...sans)} pendingMove={pendingMove} />
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
  mockUseFinder.mockClear();
  mockFocused = true;
  mockAccounts = undefined;
});

describe('useLessonScreen', () => {
  it('shows the openings of the side at the start, each row keeping where it leads', async () => {
    await showAfter(undefined);
    const { header, moves, board, stepper, review, title } = shown();
    expect(header.place).toEqual({ name: 'Openings' });
    expect(header.placeLink?.href).toEqual({ pathname: '/openings', params: {} });
    expect(title).toBe('Openings · Opening Night');
    expect(moves).toMatchObject({ heading: 'first move', owner: 'White', leadsAlways: true });
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

  it("shows the lesson's line once picked, leaving where rows lead to the idea, with no swap", async () => {
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4');
    const { header, moves, board, idea, learner, scoresheet } = shown();
    expect(header.place).toStrictEqual({ name: 'Caro-Kann Defence', parent: undefined });
    expect(header.placeLink?.href).toMatchObject({ params: { lesson: 'caro-kann' } });
    expect(moves).toMatchObject({
      heading: 'Your candidates',
      owner: undefined,
      leadsAlways: false,
    });
    expect(board.onSwap).toBeUndefined();
    expect(board.rival.name).toBe('White');
    expect(learner).toBe('black');
    expect(idea?.title).toBe('The idea');
    expect(scoresheet.ply).toBe(3);
  });

  it('names in the idea where the row pointed at leads', async () => {
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4', 'd5');
    const { moves } = shown();
    const row = moves!.candidates.find((candidate) => moves!.leadsTo(candidate))!;
    await act(async () => moves!.onPoint(row.move.uci));
    expect(shown().idea).toMatchObject({ title: `If ${row.san}`, leadsTo: moves!.leadsTo(row) });
  });

  it('lists opportunities in Explore, running the finder from where the learner asks', async () => {
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4');
    const { finder } = shown().opportunities!;
    expect(finder).toMatchObject({ from: 'none', source: { from: 'maia', rating: 1500 } });
    expect(mockUseFinder).toHaveBeenLastCalledWith(undefined);
    await act(async () => finder.onFind());
    expect(shown().opportunities!.finder).toMatchObject({ from: 'here' });
    expect(mockUseFinder).toHaveBeenLastCalledWith({
      line: uciLine('e4', 'c6', 'd4'),
      side: 'black',
      source: { from: 'maia', rating: 1500 },
      lesson: CARO_KANN,
    });
    // A screen pushed on top: the finder asks for nothing until it is in front again.
    mockFocused = false;
    await act(async () =>
      root!.render(
        <LessonIndexContext value={FIXTURE_INDEX}>
          <Screen picked={CARO_KANN} start={uciLine('e4', 'c6', 'd4')} />
        </LessonIndexContext>,
      ),
    );
    expect(mockUseFinder).toHaveBeenLastCalledWith(undefined);
    expect(shown().opportunities!.finder.from).toBe('here');
  });

  it("reads lichess's games in the opponent's band once the learner signed in", async () => {
    mockAccounts = { lichess: { username: 'learner', token: 'token' } };
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4');
    expect(shown().opportunities!.finder.source).toEqual({ from: 'lichess', band: 1400 });
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
    expect(headline.failure).toBeUndefined();
    expect(headline.eyebrowLink).toBe(header.placeLink);
  });

  it("shows a pick's wait on its row, leaving the headline as it was", async () => {
    await showWaiting('e2e4', undefined);
    expect(shown().moves?.loadingMove).toBe('e2e4');
    expect(shown().headline.title).toBe('Pick an opening.');
  });

  it("shows a pick's wait in the headline when no row is listed for it", async () => {
    await showWaiting('h2h4', undefined);
    expect(shown().moves?.loadingMove).toBeUndefined();
    expect(shown().headline.title).toBe('Setting the stage…');
  });

  it('passes on how much of the headline a narrow page draws', async () => {
    await showAfter(CARO_KANN, 'e4', 'c6', 'd4');
    // No "your move" line once the learner has moved, and the guide still leads.
    expect(shown().status).toStrictEqual({ news: 'none', pastGuide: undefined });
  });
});
