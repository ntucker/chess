/**
 * Each side's accuracy, 0 to 100, by lichess's published formula
 * (lila's modules/analyse/src/main/AccuracyPercent.scala), on the same
 * win-chance curve the app's evaluations use: a side's win percent is its
 * expected score times 100.
 */
import type { BookLabels } from '@/analysis/quality';
import type { FinalAnalysis } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

import { judgedPosition, lostPosition, type ReviewMove } from './review';

/**
 * One move's accuracy, from the mover's win percent before it and after it:
 * 100 for a move that loses nothing, falling off exponentially with the win
 * percent it gives away, with lichess's 1-point allowance for an engine's
 * imprecision. Example: losing 10 points scores about 65.
 */
export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100;
  const raw =
    103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411;
  return Math.min(Math.max(raw + 1, 0), 100);
}

/** The fewest counted moves a side needs for an accuracy: fewer would mislead. */
export const LEAST_COUNTED = 8;

/**
 * `side`'s accuracy for the game: the average of two means of its moves'
 * accuracies, one weighting each move by how much the game swung where it
 * was played, the other harmonic, which a single bad move pulls down. A
 * move's accuracy comes from the expected scores its label measured, so the
 * number agrees with the badges.
 *
 * Only judged moves count: book and forced moves, and moves whose search
 * failed, are left out. With fewer than `LEAST_COUNTED` of them the answer
 * is `'brief'`. Otherwise it's undefined until every position the review
 * searches (`judgedPosition`) is final or failed, since a move's weight
 * reads positions on both sides. So once shown, the number changes only
 * when a failed position is searched again: it leaves `failed`, and the
 * number stays hidden until that search finishes.
 * The swings are read only from those positions, so a search the game
 * happened to run elsewhere can't change it.
 */
export function gameAccuracy(
  moves: readonly ReviewMove[],
  analyses: readonly (FinalAnalysis | undefined)[],
  book: BookLabels,
  side: Color,
  failed: ReadonlySet<number>,
): number | 'brief' | undefined {
  const counted = moves.filter(
    ({ mover, status }) => mover === side && (status === 'judged' || status === 'waiting'),
  );
  if (counted.length < LEAST_COUNTED) return 'brief';
  const isSearched = (ply: number) =>
    judgedPosition(book, ply, moves.length) && !lostPosition(failed, analyses, ply);
  const known = Array.from({ length: moves.length + 1 }, (_, ply) =>
    isSearched(ply) ? analyses[ply]?.lines[0].evaluation.score : undefined,
  );
  if (known.some((score, ply) => score === undefined && isSearched(ply))) return undefined;
  const weights = swingWeights(whiteWinPercents(known));
  const scored = counted.flatMap((move) =>
    // Never empty: a counted move still waiting has an unfinished searched position, caught above.
    move.status === 'judged'
      ? [{ accuracy: moveAccuracy(move.before * 100, move.after * 100), weight: weights[move.ply] }]
      : [],
  );
  return (weightedMean(scored) + harmonicMean(scored.map(({ accuracy }) => accuracy))) / 2;
}

const weightedMean = (values: readonly { accuracy: number; weight: number }[]) =>
  values.reduce((sum, { accuracy, weight }) => sum + accuracy * weight, 0) /
  values.reduce((sum, { weight }) => sum + weight, 0);

/** Each value floored at 1, so one move scored 0 can't make the whole mean 0. */
const harmonicMean = (values: readonly number[]) =>
  values.length / values.reduce((sum, value) => sum + 1 / Math.max(value, 1), 0);

/**
 * White's win percent in each position, from White's expected score in the
 * searched ones (`known`): an unsearched position takes the nearest searched
 * one's before it, or after it at the start.
 */
function whiteWinPercents(known: readonly (number | undefined)[]): number[] {
  let last = known.find((score) => score !== undefined) ?? 0.5;
  return known.map((score) => {
    last = score ?? last;
    return last * 100;
  });
}

/**
 * Each move's weight, `weights[n]` for the move from position n: the
 * standard deviation of the win percent over a window of positions, as
 * many as a tenth of the game's moves (2 to 8), clamped to 0.5 to 12. A
 * move's window ends at the position after it; the first moves share the
 * first window, as lichess slides it.
 */
function swingWeights(percents: readonly number[]): number[] {
  const size = Math.min(Math.max(Math.floor((percents.length - 1) / 10), 2), 8);
  return Array.from({ length: percents.length - 1 }, (_, move) => {
    const end = Math.max(move + 2, size); // exclusive: the position after the move
    return Math.min(Math.max(deviation(percents.slice(end - size, end)), 0.5), 12);
  });
}

function deviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/** The lowest rounded accuracy for each verdict, best first. */
const VERDICTS: readonly (readonly [number, string])[] = [
  [90, 'Standing ovation.'],
  [75, 'Warm applause.'],
  [60, 'Mixed notices.'],
  [0, 'A rough night.'],
];

/** A side's `accuracy` as the learner sees it: rounded, so 89.6 shows as 90. */
export const shownAccuracy = (accuracy: number) => Math.round(accuracy);

/**
 * The review's verdict on a side's `accuracy`, a theater line picked by the
 * number as shown (`shownAccuracy`): 89.6 reads "Standing ovation.".
 */
export const verdictLine = (accuracy: number) =>
  VERDICTS.find(([least]) => shownAccuracy(accuracy) >= least)![1];

/** A side's `accuracy` as shown, for a sentence: "Your accuracy: 82 of 100". */
export const accuracyWords = (whose: string, accuracy: number) =>
  `${whose} accuracy: ${shownAccuracy(accuracy)} of 100`;
