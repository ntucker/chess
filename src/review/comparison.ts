/**
 * A move of the game beside Stockfish's top moves from the same position,
 * each with how it changes the position for the learner, as the review's
 * move card lists them. Pure, like the rest of the review.
 */
import { judgement } from '@/analysis/quality';
import {
  type Analysis,
  type Evaluation,
  finalOnly,
  type MoveChange,
  moveChange,
} from '@/evaluation/evaluation';
import { type Color, lineSans, parsePosition, type Ply } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';

/** One move of the comparison. */
export interface ComparedMove {
  readonly uci: Uci;
  readonly san: string;
  /** How it changes the position for the learner beside Stockfish's best; none until that's known. */
  readonly change?: MoveChange;
}

export interface Comparison {
  /** The move played. */
  readonly played: ComparedMove;
  /** Stockfish's top moves from the same position, best first, without the move played. */
  readonly others: readonly ComparedMove[];
}

/**
 * The move that leads to `plies[ply]` (from 1) beside Stockfish's top moves
 * from `plies[ply - 1]`, once its search there is final. Each reads as the
 * pawns it gains or loses for `learner` beside Stockfish's best, so the best
 * reads "0.0". The move played is measured as its label measures it
 * (`judgement`), so the two agree. Example: for Black after 7.Nc3, 7...Qxb2
 * reads "−3.3" beside 7...Nc6's "0.0". A book move, never searched, has no
 * changes and no other moves, and neither has any move until the search
 * before it is final.
 */
export function compareMove(
  plies: readonly Ply[],
  analyses: readonly (Analysis | undefined)[],
  ply: number,
  learner: Color,
): Comparison {
  const { fen, turn } = plies[ply - 1];
  const { uci, san } = plies[ply].move!;
  const before = finalOnly(analyses[ply - 1]);
  const best = before?.lines[0].evaluation;
  const change = (evaluation?: Evaluation) =>
    best && evaluation ? moveChange(best, evaluation, learner) : undefined;
  const played = before && judgement(before, finalOnly(analyses[ply]), uci, turn);
  const pos = parsePosition(fen)!;
  const others = (before?.lines ?? []).flatMap(({ uci: other, evaluation }) =>
    other && other !== uci
      ? [{ uci: other, san: lineSans([other], pos.clone())[0], change: change(evaluation) }]
      : [],
  );
  return { played: { uci, san, change: change(played?.evaluation) }, others };
}
