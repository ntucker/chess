import { StateContext, useController, useSubscription } from '@data-client/react';
import { INITIAL_FEN } from 'chessops/fen';
import { use, useEffect, useMemo } from 'react';

import type { Color } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { guideOrder } from '@/lesson/mistakes';
import type { MaiaRating } from '@/maia/ratings';
import { analysisKey, getAnalysisBehind, PositionAnalysis } from '@/resources/analysis';
import { getMaiaShares } from '@/resources/maia';
import { useNeedsStockfish } from '@/stockfish/demand';

import { byScore, type Find, findOpportunities } from './finder';
import { LIMITS } from './limits';
import { type Answers, maiaReplies } from './walk';

/** Where a run of the finder opens, and whose replies it reads. */
export interface FinderAsk {
  /** The moves from the starting position to where it opens (`FinderInput.line`). */
  readonly line: readonly Uci[];
  /** The side looking for opportunities: the one that punishes. */
  readonly side: Color;
  /** The Maia network whose shares stand in for the opponents' replies. */
  readonly rating: MaiaRating;
  /** A lesson whose guide the punishing side follows where it has moves (`guideOrder`). */
  readonly lesson?: Lesson;
}

/** A run of the finder as far as the answers in the store take it. */
export interface FinderRun {
  /** The finds that leave the punishing side clearly better, best first (`byScore`). */
  readonly finds: readonly Find[];
  /** Whether answers are still missing: the run goes on. */
  readonly running: boolean;
}

/** How many of Maia's answers are asked for at once: its worker answers one after another. */
const MAIA_AT_ONCE = 4;

/**
 * The opportunity finder run from `ask` in the app: a pure function of the
 * answers the store has (Maia's shares at `ask.rating`, Stockfish lite's
 * analyses), worked out again as they arrive, so nothing is stored but the
 * answers. It asks for the missing ones: Maia's a few at a time, and
 * Stockfish's one at a time behind every search a screen shows
 * (`getAnalysisBehind`), so the board's own searches never wait for it.
 * Pass no `ask` while the screen isn't in front: nothing is worked out or
 * asked for.
 *
 * ```ts
 * const run = useFinder(focused ? { line, side: 'white', rating: 1500 } : undefined);
 * run.finds[0]?.mistake;
 * ```
 */
export function useFinder(ask: FinderAsk | undefined): FinderRun {
  const ctrl = useController();
  const state = use(StateContext);
  const result = useMemo(() => {
    if (!ask) return undefined;
    const { line, side, rating, lesson } = ask;
    const answers: Answers = {
      replies: (spot) => {
        const shares = ctrl.getResponse(getMaiaShares, rating, spot.line, state).data;
        return shares && maiaReplies(shares);
      },
      analysis: (spot) => ctrl.get(PositionAnalysis, analysisKey('stockfish', spot.line), state),
      guideMoves: lesson
        ? ({ key }) => {
            const moves = guideOrder(lesson, key, side);
            return moves.length ? moves.map((move) => move.uci) : undefined;
          }
        : undefined,
    };
    return findOpportunities({ start: INITIAL_FEN, line, side, answers });
  }, [ask, ctrl, state]);

  const asking = result?.requests ?? [];
  const search = asking.find(({ kind }) => kind !== 'replies');
  useNeedsStockfish(search !== undefined);
  useSubscription(
    getAnalysisBehind,
    ...(search ? (['stockfish', search.spot.line] as const) : ([null] as const)),
  );
  // As text, so the effect runs again only when the lines asked for change.
  const wanted = JSON.stringify(
    asking
      .filter(({ kind }) => kind === 'replies')
      .slice(0, MAIA_AT_ONCE)
      .map(({ spot }) => spot.line),
  );
  useEffect(() => {
    if (!ask) return;
    for (const line of JSON.parse(wanted) as Uci[][]) {
      void ctrl.fetchIfStale(getMaiaShares, ask.rating, line);
    }
  }, [ask, ctrl, wanted]);

  return {
    finds: result ? kept(result) : [],
    running: asking.length > 0,
  };
}

/** A run's finds that leave the punishing side clearly better, on the guide or off it. */
function kept({ finds, offGuide }: { finds: readonly Find[]; offGuide: readonly Find[] }) {
  return [...finds, ...offGuide.filter(({ end }) => end >= LIMITS.keepScore)].sort(byScore);
}
