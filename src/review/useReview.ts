import { StateContext, useController, useSubscription } from '@data-client/react';
import { use, useEffect, useMemo, useReducer } from 'react';

import { finalOnly } from '@/evaluation/evaluation';
import { captures } from '@/game/material';
import { analyze, type Color, legalMoveCountAt, replay } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { bookMoves } from '@/lesson/select';
import { analysisError, getAnalysis, storedAnalyses } from '@/resources/analysis';
import { useNeedsStockfish } from '@/stockfish/demand';

import { gameAccuracy } from './accuracy';
import { nextSearch } from './order';
import { movesGivenUp } from './refine';
import { guideAt, momentAt } from './retry';
import {
  labelPositions,
  leftGuide,
  lostPosition,
  moments,
  nextMoment,
  reviewMoves,
  tally,
} from './review';
import { DWELL_MS, reviewedGame, reviewReducer, startReview } from './screen';

/** The review judges with Stockfish lite whatever the settings say, as lessons do. */
export const REVIEW_ENGINE = 'stockfish';

/** What the review is of. */
interface ReviewOf {
  /** The game's moves, from the starting position. */
  readonly moves: readonly Uci[];
  /** The learner's side: their moves are the moments, and the board shows it at the bottom. */
  readonly learner: Color;
  /** The lesson the game was played in: its guide's moves are book, never searched. */
  readonly lesson?: Lesson;
  /**
   * Whether the page is in front. Behind another screen it asks Stockfish
   * for nothing, and goes on from what the store has once it's back.
   */
  readonly active: boolean;
}

/**
 * A game reviewed move by move: each move's label as Stockfish's analyses
 * arrive, the learner's moments, each side's tally and accuracy, and the
 * page's own state (`screen.ts`). It asks Stockfish lite for one position at
 * a time, the one `nextSearch` picks; as each analysis lands the pick moves
 * on by itself. Stepping through the moves leaves the search alone, unless
 * the board rests about a second on a move not judged yet.
 *
 * ```ts
 * const review = useReview({ moves, learner: 'black', lesson, active: useIsFocused() });
 * ```
 */
export function useReview({ moves, learner, lesson, active }: ReviewOf) {
  const ctrl = useController();
  const state = use(StateContext);
  useNeedsStockfish(active);
  const game = reviewedGame(learner, moves);
  const [stored, dispatch] = useReducer(reviewReducer, game, startReview);
  // Another game on the same page starts its review afresh. React renders
  // again at once with the new state, but this pass runs on, so it reads
  // the fresh review too rather than a ply the new game may not have.
  if (stored.game !== game) dispatch({ type: 'review', game });
  const screen = stored.game === game ? stored : startReview(game);
  const { ply, dwelt } = screen;
  useEffect(() => {
    const timer = setTimeout(() => dispatch({ type: 'dwell', ply }), DWELL_MS);
    return () => clearTimeout(timer);
  }, [ply]);

  // Kept by hand: the compiler doesn't keep `plies` past `useSubscription`, and what each move
  // gives up (a search of every capture) should be worked out once a game, not each render.
  const plies = useMemo(() => replay(moves), [moves]);
  const givenUp = useMemo(() => movesGivenUp(plies), [plies]);
  // The moves before each position: `lines[n]` leads to `plies[n]`.
  const lines = plies.map((_, n) => moves.slice(0, n));
  const book = lesson ? bookMoves(lesson, moves) : [];
  const legal = plies.map(({ fen }) => legalMoveCountAt(fen));
  const analyses = storedAnalyses(ctrl, REVIEW_ENGINE, lines, state);
  const final = analyses.map(finalOnly);
  // Why each position's search gave up, where one did.
  const errors = lines.map((line) => analysisError(ctrl, REVIEW_ENGINE, line, state));
  const failed = new Set(errors.flatMap((error, n) => (error ? [n] : [])));
  const judged = reviewMoves({ plies, book, legal, analyses: final, failed, givenUp });
  const leftAt = lesson && leftGuide(lesson, moves, learner, book);
  // The board's ply after each moment's move.
  const shownMoments = moments(judged, learner, leftAt).map((move) => move + 1);

  // The moment shown: its tries, judged on the analyses after each.
  const base = ply > 0 ? lines[ply - 1] : [];
  const tryLines = (screen.tries.get(ply) ?? []).map((uci) => [...base, uci]);
  const tryErrors = tryLines.map((line) => analysisError(ctrl, REVIEW_ENGINE, line, state));
  // The guide's moves there matter only to judge tries, or as the answer where the learner left it.
  const guide =
    lesson && ply > 0 && (tryLines.length || ply - 1 === leftAt)
      ? guideAt(lesson, base)
      : undefined;
  const moment = momentAt({
    plies,
    moves: judged,
    analyses: final,
    legal,
    learner,
    leftAt,
    book: guide?.book ?? new Map(),
    guide: ply - 1 === leftAt ? guide?.answer : undefined,
    screen,
    tryAnalyses: storedAnalyses(ctrl, REVIEW_ENGINE, tryLines, state).map(finalOnly),
    tryFailed: tryErrors.map(Boolean),
  });
  // The line the board shows: the game's to `ply`, or at a moment, the one before its move and what's played there.
  const shownLine = moment.shownMove
    ? [...base, moment.shownMove]
    : lines[moment.board === 'retry' ? ply - 1 : ply];
  // The positions along it: the game's, or at a moment its retry's.
  const shownPlies = moment.shownMove ? replay(shownLine) : plies;
  // The board's position in them. A shown move that isn't legal there stops the replay short
  // of it, and the board shows the last position reached.
  const shownAt = Math.min(shownLine.length, shownPlies.length - 1);

  // A try waiting for its search goes first: the learner is waiting for it.
  const next = nextSearch({ moves: judged, book, analyses, learner, dwelt, failed });
  const searched =
    moment.searching !== undefined
      ? tryLines[moment.searching]
      : next === undefined
        ? undefined
        : lines[next];
  useSubscription(
    getAnalysis,
    ...(active && searched !== undefined
      ? ([REVIEW_ENGINE, searched] as const)
      : ([null] as const)),
  );
  // The positions the label of the move leading to `plies[target]` needs whose search gave up.
  const lostFor = (target: number) =>
    labelPositions(target - 1).filter((n) => lostPosition(failed, analyses, n));
  const accuracy = (side: Color) => gameAccuracy(judged, final, book, side, failed);
  return {
    plies,
    /** The position the board shows (`shownLine`), with what the board needs (`analyze`). */
    current: analyze(shownPlies[shownAt]),
    /** What each side is up and has taken by the position the board shows (`captures`). */
    captures: captures(shownPlies, shownAt),
    /** The moves to the position the board shows: the game's to `ply`, or at a moment its retry's. */
    shownLine,
    ply,
    pointed: screen.pointed,
    visited: screen.visited,
    dwelt,
    /** Each move as judged so far: `moves[n]` leads to `plies[n + 1]`. */
    moves: judged,
    /** How far Stockfish's analysis of each position has got: `analyses[n]` is of `plies[n]`. */
    analyses,
    /** Whether the guide recommends each move. */
    book,
    /** The board's ply after each of the learner's moments, in game order. */
    moments: shownMoments,
    /** The ply Next moment shows: after the earliest moment not visited yet. */
    nextMoment: nextMoment(shownMoments, screen.visited),
    /**
     * Why a search the label of the move leading to `plies[target]` needs
     * gave up, when one did: that move shows Try again (`tryAgain`).
     */
    failure(target: number) {
      const [lost] = lostFor(target);
      return lost === undefined ? undefined : errors[lost];
    },
    tally: { white: tally(judged, 'white'), black: tally(judged, 'black') },
    /** The moment shown: what retrying it shows (`momentAt`). */
    moment,
    /** Each side's accuracy (`gameAccuracy`). */
    accuracy: { white: accuracy('white'), black: accuracy('black') },
    goto: (target: number) => dispatch({ type: 'goto', ply: target }),
    point: (uci?: Uci) => dispatch({ type: 'point', uci }),
    /** Retry: the board goes back one move for a try. */
    retry: () => dispatch({ type: 'retry' }),
    /** Tries `uci` at the moment shown. */
    play: (uci: Uci) => dispatch({ type: 'try', uci }),
    /** Show best: shows the moment's answer. */
    showAnswer: () => dispatch({ type: 'show answer' }),
    /** Why the search after the latest try at the moment shown gave up, when it did. */
    tryFailure: tryErrors.at(-1),
    /** Searches again the positions after the moment's tries whose search gave up. */
    searchTriesAgain() {
      tryLines.forEach((line, n) => {
        if (tryErrors[n]) void ctrl.invalidate(getAnalysis, REVIEW_ENGINE, line);
      });
    },
    /**
     * Searches again the positions the label of the move leading to
     * `plies[target]` needs whose search gave up; the move waits again
     * meanwhile, and so does each accuracy.
     */
    tryAgain(target: number) {
      for (const n of lostFor(target)) void ctrl.invalidate(getAnalysis, REVIEW_ENGINE, lines[n]);
    },
  };
}

/** A review on a page: what `useReview` returns. */
export type Review = ReturnType<typeof useReview>;
