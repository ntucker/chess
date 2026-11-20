import { StateContext, useController, useSubscription } from '@data-client/react';
import { use } from 'react';

import { type EvaluationEngine, isFinal } from '@/evaluation/evaluation';
import type { Ply } from '@/game/replay';
import { analysisKey, getAnalysis, PositionAnalysis } from '@/resources/analysis';

import { judgeMove, type MoveQuality } from './quality';

/**
 * Each move's label, from `engine`'s final analyses of the positions before
 * and after it (`judgeMove`): `qualities[n]` labels the move that leads to
 * `plies[n + 1]`, once those are final. Only final analyses count, so a
 * move gets the same label whichever screen shows it, in whatever order:
 * the bar and lines show a search as it deepens, but a label waits for it
 * to finish.
 *
 * A move `book` marks (`book[n]` for the nth move) is labelled `book` at once,
 * since a lesson's guide recommends it; the engine never judges it.
 *
 * Only the move leading to `plies[shown]` (the board's) asks for its
 * analyses: a search takes seconds on a phone, and the engine runs the
 * newest request first. The other labels fill in as the board shows each
 * move. A `shown` of null asks for nothing, as for a screen behind another,
 * whose positions would otherwise keep the engine busy.
 *
 * ```ts
 * const qualities = useMoveQualities(plies, ply, 'stockfish', bookMoves(lesson, moves));
 * ```
 */
export function useMoveQualities(
  plies: readonly Ply[],
  shown: number | null,
  engine: EvaluationEngine,
  book: readonly boolean[] = [],
): readonly (MoveQuality | undefined)[] {
  const state = use(StateContext);
  const ctrl = useController();
  const moves = plies.slice(1).map(({ move }) => move!.uci);
  // The moves before each position: `lines[n]` leads to `plies[n]`.
  const lines = plies.map((_, n) => moves.slice(0, n));
  // The positions before and after the board's move, unless nothing is to be judged.
  const judged = shown !== null && shown > 0 && !book[shown - 1];
  const args = (ply: number) => (judged ? ([engine, lines[ply]] as const) : ([null] as const));
  // The position before first: the engine searches the newest asked for, the board's.
  useSubscription(getAnalysis, ...args((shown ?? 0) - 1));
  useSubscription(getAnalysis, ...args(shown ?? 0));
  const analyses = lines.map((line) => {
    const analysis = ctrl.get(PositionAnalysis, analysisKey(engine, line), state);
    return isFinal(analysis) ? analysis : undefined;
  });
  return moves.map((uci, n) => {
    if (book[n]) return 'book';
    const before = analyses[n];
    return before && judgeMove(before, analyses[n + 1], uci, plies[n].turn);
  });
}
