import {
  type Controller,
  type State,
  StateContext,
  useController,
  useSubscription,
} from '@data-client/react';
import { INITIAL_FEN } from 'chessops/fen';
import { use, useDeferredValue, useEffect, useMemo } from 'react';

import type { Color } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { guideOrder } from '@/lesson/mistakes';
import {
  analysisError,
  analysisKey,
  getAnalysis,
  getAnalysisBehind,
  PositionAnalysis,
} from '@/resources/analysis';
import { type ExplorerCounts, getExplorerCounts } from '@/resources/explorer';
import { getMaiaShares } from '@/resources/maia';
import { useNeedsStockfish } from '@/stockfish/demand';

import { byScore, type Find, findOpportunities, keeps } from './finder';
import { MIN_GAMES } from './limits';
import {
  type Answers,
  maiaReplies,
  type Replies,
  repliesFrom,
  type ReplySource,
  type Spot,
} from './walk';

/** Where a run of the finder opens, and whose replies it reads. */
export interface FinderAsk {
  /** The moves from the starting position to where it opens (`FinderInput.line`). */
  readonly line: readonly Uci[];
  /** The side looking for opportunities: the one that punishes. */
  readonly side: Color;
  /** Where the opponents' replies come from: lichess's games in a band, or a Maia network's estimate. */
  readonly source: ReplySource;
  /** A lesson whose guide the punishing side follows where it has moves (`guideOrder`). */
  readonly lesson?: Lesson;
}

/** A run of the finder as far as the answers in the store take it. */
export interface FinderRun {
  /** The finds that leave the punishing side clearly better, best first (`byScore`). */
  readonly finds: readonly Find[];
  /**
   * Whether answers it can ask for are still missing: the run goes on. One
   * that failed (Stockfish gave up, Maia's network threw, lichess refused) is not asked again,
   * so the run can end without what lies beyond it.
   */
  readonly running: boolean;
  /** Asks again for the answers that failed; none while none has. */
  readonly retry?: () => void;
}

/**
 * How many replies are asked for at once: Maia's worker answers one after
 * another, and lichess's explorer one request every 2.5 s (`pacedExplorer`).
 */
const REPLIES_AT_ONCE = 4;

/**
 * The opportunity finder run from `ask` in the app: a pure function of the
 * answers the store has (the replies from `ask.source`, Stockfish lite's
 * analyses), worked out again as they arrive, so nothing is stored but the
 * answers. It asks for the missing ones: the replies a few at a time, and
 * Stockfish's one at a time behind every search a screen shows
 * (`getAnalysisBehind`), so the board's own searches never wait for it.
 * Pass no `ask` while the screen isn't in front: nothing is worked out or
 * asked for.
 *
 * ```ts
 * const source = { from: 'maia', rating: 1500 } as const;
 * const run = useFinder(focused ? { line, side: 'white', source } : undefined);
 * run.finds[0]?.mistake;
 * ```
 */
export function useFinder(ask: FinderAsk | undefined): FinderRun {
  const ctrl = useController();
  // Worked out behind the screen's own renders: a walk takes 5 to 12 ms in Node
  // (more on a phone), and the store changes at every depth of every search.
  const state = useDeferredValue(use(StateContext));
  const result = useMemo(() => {
    if (!ask) return undefined;
    const { line, side, source, lesson } = ask;
    const replies = replyStore(ctrl, source);
    const answers: Answers = {
      replies: (spot) => replies.at(spot, state),
      analysis: (spot) => ctrl.get(PositionAnalysis, analysisKey('stockfish', spot.line), state),
      guideMoves: lesson
        ? ({ key }) => {
            const moves = guideOrder(lesson, key, side);
            return moves.length ? moves.map((move) => move.uci) : undefined;
          }
        : undefined,
    };
    const { requests, finds, offGuide } = findOpportunities({
      start: INITIAL_FEN,
      line,
      side,
      answers,
    });
    // An answer that failed is not asked again: the walk goes on where it can.
    const isFailed = ({ kind, spot }: (typeof requests)[number]) =>
      kind === 'replies'
        ? replies.failed(spot, state)
        : analysisError(ctrl, 'stockfish', spot.line, state) !== undefined;
    return {
      asking: requests.filter((request) => !isFailed(request)),
      failed: requests.filter(isFailed),
      finds: [...finds, ...offGuide.filter((find) => keeps(find))].sort(byScore),
    };
  }, [ask, ctrl, state]);

  const asking = result?.asking ?? [];
  const search = asking.find(({ kind }) => kind !== 'replies');
  useNeedsStockfish(search !== undefined);
  useSubscription(
    getAnalysisBehind,
    ...(search ? (['stockfish', search.spot.line] as const) : ([null] as const)),
  );
  // As text, so the effect runs again only when the positions asked about change.
  const wanted = JSON.stringify(
    asking
      .filter(({ kind }) => kind === 'replies')
      .slice(0, REPLIES_AT_ONCE)
      .map(({ spot }) => spot),
  );
  useEffect(() => {
    if (!ask) return;
    const replies = replyStore(ctrl, ask.source);
    // A failure is stored as the answer's error, which ends asking for it.
    for (const spot of JSON.parse(wanted) as Spot[]) void replies.ask(spot);
  }, [ask, ctrl, wanted]);

  const failed = result?.failed ?? [];
  return {
    finds: result?.finds ?? [],
    running: asking.length > 0,
    // Clearing an answer's error asks for it again: the replies through the effect, Stockfish's
    // through the manager, which restarts a search that gave up once it is invalidated.
    retry:
      ask && failed.length
        ? () => {
            const replies = replyStore(ctrl, ask.source);
            for (const { kind, spot } of failed) {
              if (kind === 'replies') void replies.again(spot);
              else void ctrl.invalidate(getAnalysis, 'stockfish', spot.line);
            }
          }
        : undefined,
  };
}

/**
 * The replies from `source` in the store: those at a spot, whether asking for
 * them failed, asking for them if the store lacks them, and asking again.
 */
function replyStore(ctrl: Controller, source: ReplySource) {
  if (source.from === 'maia') {
    const { rating } = source;
    return {
      at: (spot: Spot, state: State<unknown>): Replies | undefined => {
        const shares = ctrl.getResponse(getMaiaShares, rating, spot.line, state).data;
        return shares && maiaReplies(shares);
      },
      failed: (spot: Spot, state: State<unknown>) =>
        ctrl.getError(getMaiaShares, rating, spot.line, state) !== undefined,
      ask: (spot: Spot) => ctrl.fetchIfStale(getMaiaShares, rating, spot.line),
      again: (spot: Spot) => ctrl.invalidate(getMaiaShares, rating, spot.line),
    };
  }
  const { band } = source;
  return {
    at: (spot: Spot, state: State<unknown>): Replies | undefined => {
      // Data Client types a schema-less endpoint's stored answer as undefined.
      const counted = ctrl.getResponse(getExplorerCounts, band, spot.key, state).data as
        ExplorerCounts | undefined;
      return counted && repliesFrom(spot.key, counted.counts, MIN_GAMES, counted.total);
    },
    failed: (spot: Spot, state: State<unknown>) =>
      ctrl.getError(getExplorerCounts, band, spot.key, state) !== undefined,
    ask: (spot: Spot) => ctrl.fetchIfStale(getExplorerCounts, band, spot.key),
    again: (spot: Spot) => ctrl.invalidate(getExplorerCounts, band, spot.key),
  };
}
