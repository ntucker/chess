/**
 * How good a move was, as chess.com labels moves: by how much of the mover's
 * expected score it gave away.
 */
import type { Evaluation, TopMove } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

/**
 * The labels, from best to worst. `book` is the opening guide's own move; it
 * comes from lesson data, so `classifyMove` never returns it.
 */
export type MoveQuality = 'book' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * The least expected score (0 to 1, the mover's) a move must give away for
 * each label. These are chess.com's "expected points lost" limits
 * (https://support.chess.com/en/articles/8572705), with its "excellent"
 * (under 0.02) folded into good. Lichess, on the same win-chance curve the
 * app's evaluations use, is stricter about blunders: 0.05, 0.10 and 0.15
 * (lila's modules/tree/src/main/Advice.scala, whose winning chances run from
 * -1 to 1, so its 0.1, 0.2 and 0.3 are half as much expected score).
 */
const LEAST_LOSS: readonly (readonly [number, MoveQuality])[] = [
  [0.2, 'blunder'],
  [0.1, 'mistake'],
  [0.05, 'inaccuracy'],
];

export interface JudgedMove {
  /** The position before the move. */
  readonly before: Evaluation;
  /** The position after it. */
  readonly after: Evaluation;
  /** The move (UCI, castling as the king's two-square move). */
  readonly uci: string;
  readonly mover: Color;
}

/**
 * A move's label. It's the best if it's the move the engine would have
 * played, or gives nothing away (another mate, or an engine that names no
 * move, like Maia). That's broader than chess.com, which keeps "best" for
 * the engine's own move: a second move that loses nothing is as good for
 * learning an opening. Otherwise the expected score it gives away decides.
 */
export function classifyMove({ before, after, uci, mover }: JudgedMove): MoveQuality {
  const whiteLoss = before.score - after.score;
  const loss = mover === 'white' ? whiteLoss : -whiteLoss;
  if (uci === before.best || loss <= 0) return 'best';
  return LEAST_LOSS.find(([least]) => loss >= least)?.[1] ?? 'good';
}

/**
 * What the engine's `top` moves in a position (best first) say about playing
 * `uci` there: the first move's score stands for the position, and a listed
 * move's own score for the position after it, so the label agrees with the
 * list: its first move is the best, and another gives away what its listed
 * score says. Two searches of nearby positions can disagree by more than an
 * inaccuracy, which could otherwise call the list's first move dubious. A
 * move the list skips has no `after`: the next position's evaluation judges it.
 */
export function listJudgement(
  top: readonly TopMove[] | undefined,
  uci: string,
): Partial<Pick<JudgedMove, 'before' | 'after'>> {
  const [first] = top ?? [];
  if (!first) return {};
  return {
    before: { ...first.evaluation, best: first.uci },
    after: top!.find((move) => move.uci === uci)?.evaluation,
  };
}
