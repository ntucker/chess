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
  const [first] = before.lines;
  /** How much of the mover's expected score playing into `evaluation` gives away. */
  const lossTo = ({ score }: Evaluation) =>
    mover === 'white' ? first.evaluation.score - score : score - first.evaluation.score;
  const listed = before.lines.find((line) => line.uci === uci);
  const last = before.lines.at(-1)!;
  // A list without moves (Maia's) ranks nothing.
  const lastListedLoss = last.uci ? lossTo(last.evaluation) : -Infinity;
  let loss: number;
  if (listed) loss = lossTo(listed.evaluation);
  else if (after) loss = Math.max(lossTo(after.lines[0].evaluation), lastListedLoss);
  else return undefined;
  if (uci === first.uci || loss <= 0) return 'best';
  return LEAST_LOSS.find(([threshold]) => loss >= threshold)?.[1] ?? 'good';
}
