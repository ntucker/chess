import { StateContext, useController, useSubscription } from '@data-client/react';
import { use, useEffect, useReducer, useState } from 'react';

import { finalOnly } from '@/evaluation/evaluation';
import { analyze, type Color, legalMovesAt, replay } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { bookMoves } from '@/lesson/select';
import { analysisFailed, getAnalysis, storedAnalyses } from '@/resources/analysis';
import { useNeedsStockfish } from '@/stockfish/demand';

import { gameAccuracy } from './accuracy';
import { nextSearch } from './order';
import {
  labelPositions,
  leftGuide,
  lostPosition,
  moments,
  nextMoment,
  reviewMoves,
  tally,
} from './review';
import { initialReview, reviewReducer } from './screen';

/** How long the board rests on a move not judged yet before its positions go next. */
const DWELL_MS = 1000;

/** The review judges with Stockfish lite whatever the settings say, as lessons do. */
const ENGINE = 'stockfish';

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
  const [screen, dispatch] = useReducer(reviewReducer, initialReview);
  const { ply } = screen;
  // The ply the board last rested on for `DWELL_MS`; only while it's still
  // shown does its move go next, so stepping through leaves the search alone.
  const [rested, setRested] = useState(ply);
  const dwelt = rested === ply ? ply : undefined;
  useEffect(() => {
    const timer = setTimeout(() => setRested(ply), DWELL_MS);
    return () => clearTimeout(timer);
  }, [ply]);

  const plies = replay(moves);
  // The moves before each position: `lines[n]` leads to `plies[n]`.
  const lines = plies.map((_, n) => moves.slice(0, n));
  const book = lesson ? bookMoves(lesson, moves) : [];
  const legal = plies.map(({ fen }) => legalMovesAt(fen));
  const analyses = storedAnalyses(ctrl, ENGINE, lines, state);
  const final = analyses.map(finalOnly);
  const failed = new Set(
    lines.flatMap((line, n) => (analysisFailed(ctrl, ENGINE, line, state) ? [n] : [])),
  );
  const judged = reviewMoves({ plies, book, legal, analyses: final, failed });
  const leftAt = lesson && leftGuide(lesson, moves, learner, book);
  // The board's ply after each moment's move.
  const shownMoments = moments(judged, learner, leftAt).map((move) => move + 1);

  const searched = nextSearch({ moves: judged, book, analyses, learner, dwelt, failed });
  useSubscription(
    getAnalysis,
    ...(active && searched !== undefined
      ? ([ENGINE, lines[searched]] as const)
      : ([null] as const)),
  );
  const accuracy = (side: Color) => gameAccuracy(judged, final, book, side, failed);
  return {
    plies,
    /** The position shown, with what the board needs (`analyze`). */
    current: analyze(plies[ply]),
    ...screen,
    /** The ply the board has rested on about a second, while it's shown. */
    dwelt,
    /** Each move as judged so far: `moves[n]` leads to `plies[n + 1]`. */
    moves: judged,
    /** Whatever Stockfish's analysis of each position has reached: `analyses[n]` is of `plies[n]`. */
    analyses,
    /** Whether the guide recommends each move. */
    book,
    /** The board's ply after each of the learner's moments, in game order. */
    moments: shownMoments,
    /** The ply Next moment shows: after the earliest moment not visited yet. */
    nextMoment: nextMoment(shownMoments, screen.visited),
    /** How many moves still wait for an analysis; none once the game is checked. */
    waiting: judged.filter(({ status }) => status === 'waiting').length,
    tally: { white: tally(judged, 'white'), black: tally(judged, 'black') },
    /** Each side's accuracy (`gameAccuracy`). */
    accuracy: { white: accuracy('white'), black: accuracy('black') },
    goto: (target: number) => dispatch({ type: 'goto', ply: target }),
    point: (uci?: Uci) => dispatch({ type: 'point', uci }),
    /**
     * Searches again the positions the label of the move leading to
     * `plies[target]` needs whose search gave up; the move waits again
     * meanwhile, and so does each accuracy.
     */
    tryAgain(target: number) {
      for (const n of labelPositions(target - 1)) {
        if (lostPosition(failed, analyses, n)) void ctrl.invalidate(getAnalysis, ENGINE, lines[n]);
      }
    },
  };
}

/** A review on a page: what `useReview` returns. */
export type Review = ReturnType<typeof useReview>;
