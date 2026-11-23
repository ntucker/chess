// For tests only: analyses written as their moves and White's expected scores,
// and review moves.
import type { ReviewQuality } from '@/analysis/quality';
import type { Analysis, AnalysisLine, FinalAnalysis } from '@/evaluation/evaluation';

import type { ReviewMove } from './review';

/** Lines of (move, White's expected score after it), best first. */
type Lines = [string | undefined, number][];

const analysisLines = (lines: Lines): AnalysisLine[] =>
  lines.map(([uci, score]) => ({ ...(uci && { uci }), evaluation: { score, pawns: 0 } }));

/** A final analysis listing `lines`, best first. */
export const listing = (...lines: Lines): FinalAnalysis => ({
  lines: analysisLines(lines),
  depth: 18,
  final: true,
});

/** A search of `lines` that has finished `depth` but isn't final. */
export const partial = (depth: number, ...lines: Lines): Analysis => ({
  lines: analysisLines(lines),
  depth,
  final: false,
});

const mover = (ply: number) => (ply % 2 === 0 ? 'white' : 'black');

/** A book move at `ply` (White's on even plies). */
export const bookMove = (ply: number): ReviewMove => ({
  ply,
  mover: mover(ply),
  status: 'book',
  quality: 'book',
});

/** A move at `ply` the review hasn't judged yet. */
export const waitingMove = (ply: number): ReviewMove => ({
  ply,
  mover: mover(ply),
  status: 'waiting',
});

/** The only legal move at `ply`. */
export const forcedMove = (ply: number): ReviewMove => ({
  ply,
  mover: mover(ply),
  status: 'forced',
  quality: 'best',
});

/** A move at `ply` whose label needs a position that failed to search. */
export const failedMove = (ply: number): ReviewMove => ({
  ply,
  mover: mover(ply),
  status: 'failed',
});

/**
 * A move at `ply` judged `quality`, from White's expected score `before` to
 * `after` (the mover's are worked out from them).
 */
export function judgedMove(
  ply: number,
  quality: ReviewQuality = 'good',
  before = 0.5,
  after = before,
): ReviewMove {
  const side = (score: number) => (mover(ply) === 'white' ? score : 1 - score);
  return {
    ply,
    mover: mover(ply),
    status: 'judged',
    quality,
    before: side(before),
    after: side(after),
  };
}
