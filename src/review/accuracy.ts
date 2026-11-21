/**
 * Each side's accuracy, 0 to 100, by lichess's published formula
 * (lila's modules/analyse/src/main/AccuracyPercent.scala), on the same
 * win-chance curve the app's evaluations use: a side's win percent is its
 * expected score times 100.
 */
import type { FinalAnalysis } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

import { judgedPosition, type ReviewMove } from './review';

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

/**
 * `side`'s accuracy for the game: the average of a mean of its moves'
 * accuracies, each weighted by how much the game swung where it was played,
 * and their harmonic mean, which a single bad move pulls down. Each move's
 * accuracy comes from the expected scores its label measured, so the number
 * never disagrees with the badges; a book move counts as 100 and a forced
 * one not at all.
 *
 * The swings are the standard deviation of the win percent over a window of
 * positions (a tenth of the game, 2 to 8 positions, clamped to 0.5 to 12),
 * read from the final analyses of the positions the review searches
 * (`judgedPosition`); a book position the review doesn't search takes the
 * nearest searched one's before it (or after it, at the start), so a search
 * the game happened to run there can't change the number. A window spans
 * both sides' positions, so the number waits until every searched position
 * is final: once shown, it never changes.
 */
export function gameAccuracy(
  moves: readonly ReviewMove[],
  analyses: readonly (FinalAnalysis | undefined)[],
  book: readonly boolean[],
  side: Color,
): number | undefined {
  const searched = Array.from({ length: moves.length + 1 }, (_, ply) => ply).filter((ply) =>
    judgedPosition(book, ply, moves.length),
  );
  if (searched.some((ply) => !analyses[ply])) return undefined;
  const weights = swingWeights(whiteWinPercents(moves.length, analyses, book));
  // With every searched position final, every move is judged, book or forced.
  const scored = moves.flatMap((move) => {
    if (move.mover !== side || move.status === 'forced' || move.status === 'waiting') return [];
    const accuracy =
      move.status === 'book' ? 100 : moveAccuracy(move.before * 100, move.after * 100);
    return [{ accuracy, weight: weights[move.ply] }];
  });
  if (!scored.length) return undefined;
  return (weightedMean(scored) + harmonicMean(scored.map(({ accuracy }) => accuracy))) / 2;
}

const weightedMean = (values: readonly { accuracy: number; weight: number }[]) =>
  values.reduce((sum, { accuracy, weight }) => sum + accuracy * weight, 0) /
  values.reduce((sum, { weight }) => sum + weight, 0);

const harmonicMean = (values: readonly number[]) =>
  values.length / values.reduce((sum, value) => sum + 1 / value, 0);

/** White's win percent in each of the game's `moves + 1` positions, as `gameAccuracy` reads them. */
function whiteWinPercents(
  moves: number,
  analyses: readonly (FinalAnalysis | undefined)[],
  book: readonly boolean[],
): number[] {
  const known = Array.from({ length: moves + 1 }, (_, ply) =>
    judgedPosition(book, ply, moves) ? analyses[ply]?.lines[0].evaluation.score : undefined,
  );
  const first = known.find((score) => score !== undefined) ?? 0.5;
  let last = first;
  return known.map((score) => {
    last = score ?? last;
    return last * 100;
  });
}

/**
 * Each move's weight, `weights[n]` for the move from position n: the
 * standard deviation of the win percent over a window of positions, slid
 * as lichess slides it. The first window repeats for the first few moves,
 * so there is one per move, and a later move's window ends at the position
 * after it.
 */
function swingWeights(percents: readonly number[]): number[] {
  const size = Math.min(Math.max(Math.floor((percents.length - 1) / 10), 2), 8);
  const windows = [
    ...Array.from({ length: Math.max(Math.min(size, percents.length) - 2, 0) }, () =>
      percents.slice(0, size),
    ),
    ...Array.from({ length: Math.max(percents.length - size + 1, 0) }, (_, i) =>
      percents.slice(i, i + size),
    ),
  ];
  return windows.map((window) => Math.min(Math.max(deviation(window), 0.5), 12));
}

function deviation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}
