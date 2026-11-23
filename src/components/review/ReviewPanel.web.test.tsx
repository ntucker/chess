// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { FinalAnalysis } from '@/evaluation/evaluation';
import { type Color, legalMoveCountAt, replay } from '@/game/replay';
import { momentAt } from '@/review/retry';
import { reviewMoves } from '@/review/review';
import { listing } from '@/review/review.fixture';
import { type ReviewScreen, startReview } from '@/review/screen';
import { themes } from '@/theme/theme';

import { ReviewActionBar } from './ReviewActions';
import { ReviewPanel, type ReviewView } from './ReviewPanel';

// The graph draws with react-native-svg, and its gestures need gesture handler's root.
jest.mock('./ReviewGraph', () => ({ ReviewGraph: () => null }));
// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// The scoresheet drawer's Escape listens only on the focused screen, as this one is.
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 1.e4 e5 2.Qh5, the learner playing Black.
const LINE = ['e2e4', 'e7e5', 'd1h5'];
const PLIES = replay(LINE);
const LEGAL = PLIES.map(({ fen }) => legalMoveCountAt(fen));
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
}

/** The review of LINE with the analyses of `searched` plies, at `ply`. */
function review(
  ply: number,
  searched: readonly number[],
  overrides: Partial<ReviewView> = {},
  { learner = 'black', screen = {}, tryAnalyses = [] }: Shown = {},
) {
  const analyses = PLIES.map((_, n) => (searched.includes(n) ? SEARCHED[n] : undefined));
  const failed = new Set(overrides.failure ? [ply] : []);
  const moves = reviewMoves({ plies: PLIES, book: [], legal: LEGAL, analyses, failed });
  const moment = momentAt({
    plies: PLIES,
    moves,
    analyses,
    legal: LEGAL,
    learner,
    book: [],
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
  act(() => root.render(<SilkProvider theme={themes.dark}>{ui}</SilkProvider>));
  const result = read(host);
  act(() => root.unmount());
  host.remove();
  return result;
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
