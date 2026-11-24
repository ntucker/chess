// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import type { FinalAnalysis } from '@/evaluation/evaluation';
import { type Color, legalMoveCountAt, replay } from '@/game/replay';
import { movesGivenUp } from '@/review/refine';
import { type GuideAnswer, momentAt } from '@/review/retry';
import { reviewMoves, tally } from '@/review/review';
import { listing } from '@/review/review.fixture';
import { type ReviewScreen, startReview } from '@/review/screen';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { ReviewActionBar } from './ReviewActions';
import { ReviewPanel, type ReviewView } from './ReviewPanel';

// The graph draws with react-native-svg, and its gestures need gesture handler's root.
jest.mock('./ReviewGraph', () => ({ ReviewGraph: () => null }));
// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// The scoresheet drawer's Escape listens only on the focused screen, as this one is.
// A link draws its text, and names where it goes and how.
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  Link: ({ children, href, push }: { children: ReactNode; href: unknown; push?: boolean }) => (
    <span data-href={JSON.stringify(href)} data-push={push}>
      {children}
    </span>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 1.e4 e5 2.Qh5, the learner playing Black.
const LINE = ['e2e4', 'e7e5', 'd1h5'];
const PLIES = replay(LINE);
const LEGAL = PLIES.map(({ fen }) => legalMoveCountAt(fen));
const GIVEN_UP = movesGivenUp(PLIES);
const SEARCHED: readonly FinalAnalysis[] = [
  listing(['e2e4', 0.55], ['d2d4', 0.55]),
  listing(['e7e5', 0.55], ['c7c5', 0.56], ['e7e6', 0.57]),
  listing(['g1f3', 0.55], ['b1c3', 0.53]),
  listing(['b8c6', 0.4]),
];

/** How a review is shown: whose moves are the learner's, and the page's state of retries. */
interface Shown {
  readonly learner?: Color;
  readonly screen?: Partial<ReviewScreen>;
  /** The final analysis after each try, where there is one. */
  readonly tryAnalyses?: readonly (FinalAnalysis | undefined)[];
  /** Where the learner left the guide, and the guide's move there. */
  readonly leftAt?: number;
  readonly guide?: GuideAnswer;
}

/** The review of LINE with the analyses of `searched` plies, at `ply`. */
function review(
  ply: number,
  searched: readonly number[],
  overrides: Partial<ReviewView> = {},
  { learner = 'black', screen = {}, tryAnalyses = [], leftAt, guide }: Shown = {},
) {
  const analyses = PLIES.map((_, n) => (searched.includes(n) ? SEARCHED[n] : undefined));
  const failed = new Set(overrides.failure ? [ply] : []);
  const moves = reviewMoves({
    plies: PLIES,
    book: [],
    legal: LEGAL,
    analyses,
    failed,
    givenUp: GIVEN_UP,
  });
  const moment = momentAt({
    plies: PLIES,
    moves,
    analyses,
    legal: LEGAL,
    learner,
    leftAt,
    book: guide ? [guide.uci] : [],
    guide,
    screen: { ...startReview(''), ...screen, ply },
    tryAnalyses,
    tryFailed: [],
  });
  return {
    plies: PLIES,
    ply,
    moves,
    analyses,
    book: [],
    moments: [],
    pointed: undefined,
    nextMoment: undefined,
    moment,
    goto: () => {},
    point: () => {},
    tryAgain: () => {},
    failure: () => undefined,
    retry: () => {},
    showAnswer: () => {},
    tryFailure: undefined,
    searchTriesAgain: () => {},
    tally: { white: tally(moves, 'white'), black: tally(moves, 'black') },
    accuracy: { white: undefined, black: undefined },
    ...overrides,
  } satisfies ReviewView;
}

/** Renders the panel (or `ui`), and reads its host with `read`. */
function render<T>(
  view: ReviewView,
  read: (host: HTMLElement) => T,
  ui = <ReviewPanel eyebrow="Review" learner="black" review={view} />,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>{ui}</SettingsProvider>
      </SilkProvider>,
    ),
  );
  const result = read(host);
  act(() => root.unmount());
  host.remove();
  return result;
}

/** What screen readers hear: the text outside `aria-hidden` parts. */
function spoken(host: HTMLElement) {
  const copy = host.cloneNode(true) as HTMLElement;
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent ?? '';
}

const heading = (host: HTMLElement) => host.querySelector('[role="heading"]')?.textContent;
const button = (host: HTMLElement, name: RegExp) =>
  [...host.querySelectorAll<HTMLElement>('[role="button"]')].find((element) =>
    name.test(element.getAttribute('aria-label') ?? element.textContent ?? ''),
  );

describe('ReviewPanel', () => {
  it('says the reviews are coming in, with how far they have got, while moves wait', () => {
    render(review(0, [0, 1]), (host) => {
      expect(heading(host)).toBe('The reviews are coming in…');
      expect(host.textContent).toContain('Checking each move: 2 of 3.');
      // The scoresheet rings the move still waiting.
      expect(button(host, /^Qh5, not judged yet$/)).toBeDefined();
    });
  });

  it("names a judged move's label, and lists Stockfish's other moves beside it", () => {
    render(review(3, [0, 1, 2, 3]), (host) => {
      expect(heading(host)).toBe('Mistake.');
      expect(host.textContent).toContain('2.Qh5');
      expect(button(host, /^Nf3/)).toBeDefined();
      expect(button(host, /^Nc3/)).toBeDefined();
    });
  });

  it('previews a row on the board when pointed at', () => {
    const point = jest.fn();
    render(review(3, [0, 1, 2, 3], { point }), (host) => {
      act(() => button(host, /^Nf3/)!.click());
      expect(point).toHaveBeenCalledWith('g1f3');
    });
  });

  it('offers Try again on a move whose search gave up, and searches it again', () => {
    const tryAgain = jest.fn();
    const failure = () => new Error('gave up');
    render(review(3, [0, 1, 2], { failure, tryAgain }), (host) => {
      expect(heading(host)).toBe('No verdict yet.');
      act(() => button(host, /Try again/)!.click());
      expect(tryAgain).toHaveBeenCalledWith(3);
    });
  });

  it('goes to the next moment, and keeps Retry and Show best disabled', () => {
    const goto = jest.fn();
    render(review(0, [0, 1, 2, 3], { nextMoment: 2, goto }), (host) => {
      expect(heading(host)).toBe('The reviews are in.');
      act(() => button(host, /First moment/)!.click());
      expect(goto).toHaveBeenCalledWith(2);
      expect(button(host, /^Retry/)?.getAttribute('aria-disabled')).toBe('true');
      expect(button(host, /^Show best/)?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  it("gives the verdict on the learner's accuracy at the start, over the game and its moments", () => {
    const checked = (black: ReviewView['accuracy']['black']) =>
      review(0, [0, 1, 2, 3], { accuracy: { white: 64, black }, moments: [2] });
    render(checked(81), (host) => {
      expect(heading(host)).toBe('Warm applause.');
      expect(host.textContent).toContain('2 moves. 1 moment to replay.');
    });
    render(checked('brief'), (host) => {
      expect(heading(host)).toBe('A brief appearance.');
      // The reason is the title's tooltip, which screen readers hear after it.
      expect(host.textContent).toContain(
        'A brief appearance.No verdict or accuracy: fewer than 8 of your moves were judged',
      );
      // Once: the narrow page's short line, which screen readers skip, doesn't repeat it.
      expect(spoken(host).match(/No verdict or accuracy/g)).toHaveLength(1);
    });
  });

  it("tallies each side's labels at the start, the learner's first, and none at a move", () => {
    /** Each label's row: its counts, the learner's then the opponent's. */
    const counts = (host: HTMLElement) =>
      [...host.querySelectorAll('[role="table"] [role="row"]')]
        .slice(1)
        .map((row) => row.textContent?.slice(-2));
    // 1.e4 and 1...e5 are each side's best move; 2.Qh5 is White's mistake.
    render(review(0, [0, 1, 2, 3]), (host) => {
      expect(counts(host)).toEqual(['00', '00', '11', '00', '00', '00', '00', '01', '00']);
    });
    render(review(2, [0, 1, 2, 3]), (host) => expect(counts(host)).toEqual([]));
  });

  it('keeps Next moment disabled with no moment left to visit', () => {
    render(review(3, [0, 1, 2, 3]), (host) => {
      expect(button(host, /Next moment/)?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  /** The panel of White's review, at 2.Qh5, a mistake. */
  const asWhite = (view: ReviewView) => (
    <ReviewPanel eyebrow="Review" learner="white" review={view} />
  );

  it("hides Stockfish's moves at the learner's mistake, and offers Retry and Show best", () => {
    const retry = jest.fn();
    const showAnswer = jest.fn();
    const view = review(3, [0, 1, 2, 3], { retry, showAnswer }, { learner: 'white' });
    render(
      view,
      (host) => {
        expect(heading(host)).toBe('Mistake.');
        expect(host.textContent).toContain('Find a better move than 2.Qh5.');
        expect(host.textContent).toContain('Other moves hidden');
        expect(button(host, /^Nf3/)).toBeUndefined();
        act(() => button(host, /^Retry/)!.click());
        expect(retry).toHaveBeenCalled();
        act(() => button(host, /^Show best/)!.click());
        expect(showAnswer).toHaveBeenCalled();
      },
      asWhite(view),
    );
  });

  it("asks for the guide's move, or one stronger than the game's, where a fine move left the guide", () => {
    const guide = { uci: 'c7c5', practice: { pathname: '/lesson/x', params: {} } } as const;
    render(review(2, [0, 1, 2, 3], {}, { leftAt: 1, guide }), (host) => {
      expect(host.textContent).toContain("Find the guide's move, or one stronger than 1…e5.");
      expect(host.textContent).toContain('Other moves hidden');
    });
  });

  it("names a try that passes, and shows Stockfish's moves with Show best disabled", () => {
    const tries = new Map([[3, ['g1f3']]]);
    const view = review(3, [0, 1, 2, 3], {}, { learner: 'white', screen: { tries, board: 'try' } });
    render(
      view,
      (host) => {
        expect(heading(host)).toBe('Best move.');
        expect(host.textContent).toContain('Found with 2.Nf3, on try 1.');
        expect(host.textContent).not.toContain('Other moves hidden');
        expect(button(host, /^Nc3/)).toBeDefined();
        expect(button(host, /^Show best/)?.getAttribute('aria-disabled')).toBe('true');
      },
      asWhite(view),
    );
  });

  it('offers Play on from here once revealed, over the review', () => {
    const playOn = { pathname: '/lesson/caro-kann', params: { moves: 'e2e4 e7e5 g1f3' } };
    const link = (host: HTMLElement) =>
      [...host.querySelectorAll('[data-href]')].find((element) =>
        element.textContent?.includes('Play on from here'),
      );
    const revealed = review(
      3,
      [0, 1, 2, 3],
      {},
      { learner: 'white', screen: { tries: new Map([[3, ['g1f3']]]) } },
    );
    render(
      revealed,
      (host) => {
        expect(JSON.parse(link(host)!.getAttribute('data-href')!)).toEqual(playOn);
        expect(link(host)!.getAttribute('data-push')).toBe('true');
      },
      <ReviewPanel eyebrow="Review" learner="white" review={revealed} lesson="caro-kann" />,
    );
    // Without a lesson, the link goes to the free-game page, keeping the learner's side.
    render(
      revealed,
      (host) =>
        expect(JSON.parse(link(host)!.getAttribute('data-href')!)).toEqual({
          pathname: '/play',
          params: { moves: 'e2e4 e7e5 g1f3', side: 'white' },
        }),
      <ReviewPanel eyebrow="Review" learner="white" review={revealed} />,
    );
  });

  it('checks a try Stockfish did not list, then keeps the moves hidden when it fails', () => {
    const tries = new Map([[3, ['a2a3']]]);
    const screen = { tries, board: 'try' } as const;
    const waiting = review(3, [0, 1, 2, 3], {}, { learner: 'white', screen });
    render(waiting, (host) => expect(heading(host)).toBe('Checking your try…'), asWhite(waiting));
    const failed = review(
      3,
      [0, 1, 2, 3],
      {},
      { learner: 'white', screen, tryAnalyses: [listing(['e7e5', 0.3])] },
    );
    render(
      failed,
      (host) => {
        expect(heading(host)).toBe('Blunder.');
        expect(host.textContent).toContain('Your retry: 2.a3.');
        expect(host.textContent).toContain('Other moves hidden');
      },
      asWhite(failed),
    );
  });

  it("shows the opponent's move with its comparison, and nothing to retry", () => {
    render(review(3, [0, 1, 2, 3]), (host) => {
      expect(host.textContent).not.toContain('Other moves hidden');
      expect(button(host, /^Retry/)?.getAttribute('aria-disabled')).toBe('true');
    });
  });

  it("opens a narrow page's scoresheet in a drawer, which closes again", () => {
    const view = review(2, [0, 1, 2, 3]);
    const onClose = jest.fn();
    render(
      view,
      (host) => {
        expect(host.querySelector('[role="region"][aria-label="Scoresheet"]')).not.toBeNull();
        act(() => button(host, /Close the scoresheet/)!.click());
        expect(onClose).toHaveBeenCalled();
      },
      <ReviewPanel eyebrow="Review" learner="black" review={view} drawer={{ onClose }} />,
    );
    render(view, (host) => {
      expect(host.querySelector('[role="region"]')).toBeNull();
    });
  });
});

describe('ReviewActionBar', () => {
  it('names its three actions, and goes to the next moment', () => {
    const goto = jest.fn();
    const view = review(1, [0, 1, 2, 3], { nextMoment: 2, goto });
    render(
      view,
      (host) => {
        expect(host.querySelector('[role="toolbar"]')?.getAttribute('aria-label')).toBe(
          'Review actions',
        );
        expect(button(host, /^Retry/)?.getAttribute('aria-disabled')).toBe('true');
        expect(button(host, /^Show best/)?.getAttribute('aria-disabled')).toBe('true');
        act(() => button(host, /^Next moment$/)!.click());
        expect(goto).toHaveBeenCalledWith(2);
      },
      <ReviewActionBar {...view} />,
    );
  });
});
