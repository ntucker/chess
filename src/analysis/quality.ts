/**
 * How good a move was, as chess.com labels moves: by how much of the mover's
 * expected score it gave away.
 */
import type { Evaluation, FinalAnalysis } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

/**
 * The labels, from best to worst. `book` is the opening guide's own move; it
 * comes from lesson data, so `judgeMove` never returns it.
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

/**
 * A move's label, from the analysis of the position before it and, unless
 * that lists the move, the position after it; undefined while one it needs
 * is missing. The first line is the position's score; the move is the best
 * if it's the line's move, or gives nothing away (another mate, or an
 * engine that names no move, like Maia). That's broader than chess.com,
 * which keeps "best" for the engine's own move: a second move that loses
 * nothing is as good for learning an opening. Otherwise the expected score
 * it gives away decides, judged by the move's own line where `before`
 * lists it, so a label agrees with the list. A move the list skips is
 * judged by `after`'s first line, but never as better than the list's last
 * move: the search ranked it below that, and a search of the next position
 * can disagree with it by more than an inaccuracy.
 */
export function judgeMove(
  before: FinalAnalysis,
  after: FinalAnalysis | undefined,
  uci: string,
  mover: Color,
): MoveQuality | undefined {
  const judged = judgedEvaluation(before, after, uci, mover);
  if (!judged) return undefined;
  const loss = signed(before.lines[0].evaluation, mover) - signed(judged, mover);
  if (uci === before.lines[0].uci || loss <= 0) return 'best';
  return LEAST_LOSS.find(([threshold]) => loss >= threshold)?.[1] ?? 'good';
}

/**
 * The evaluation `judgeMove` labels `uci` by (see there): its own line where
 * `before` lists it, else `after`'s first line, but never better for `mover`
 * than the list's last move; undefined while `after` is needed and missing.
 */
export function judgedEvaluation(
  before: FinalAnalysis,
  after: FinalAnalysis | undefined,
  uci: string,
  mover: Color,
): Evaluation | undefined {
  const listed = before.lines.find((line) => line.uci === uci);
  if (listed) return listed.evaluation;
  if (!after) return undefined;
  const last = before.lines.at(-1)!;
  const reached = after.lines[0].evaluation;
  // A list without moves (Maia's) ranks nothing.
  return last.uci && signed(last.evaluation, mover) < signed(reached, mover)
    ? last.evaluation
    : reached;
}

/**
 * White's score, negated for Black: higher is better for `mover`, like
 * `scoreFor`, but negating is exact, so the same swing in White's score is
 * the same loss for either side, even at a label's limit (in floats,
 * 0.06 - 0.01 is under 0.05 but 0.99 - 0.94 is over).
 */
const signed = ({ score }: Evaluation, mover: Color) => (mover === 'white' ? score : -score);
