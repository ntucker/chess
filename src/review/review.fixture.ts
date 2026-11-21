// For tests only: analyses written as their moves and White's expected scores.
import type { Analysis, AnalysisLine, FinalAnalysis } from '@/evaluation/evaluation';

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
