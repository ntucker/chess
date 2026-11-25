/**
 * The rule for which replies to a mistake punish it, shared by the importer's
 * finder (`acceptedReplies` in ./finder.ts) and the app's cue (`tryVerdict`
 * in ./cue.ts), in a module of its own so the app doesn't load the finder.
 */
import { judgement, MISTAKE_LOSS } from '@/analysis/quality';
import { type FinalAnalysis, forSide } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';

/**
 * Whether the cue accepts `uci`, a reply of the punishing `side`, by its
 * final analysis `after`: its first line always (so a cue has one even when
 * the searches before and after the mistake disagree a little); another move
 * it lists where that move labels best or good and still gains at least the
 * mistake limit beside `before`, the final analysis of the position before
 * the mistake; a move it doesn't list never. Undefined while `before` is
 * needed and missing: only a listed move after the first needs it.
 */
export function acceptsReply(
  before: FinalAnalysis | undefined,
  after: FinalAnalysis,
  side: Color,
  uci: Uci,
): boolean | undefined {
  const rank = after.lines.findIndex((line) => line.uci === uci);
  if (rank === -1) return false;
  if (rank === 0) return true;
  if (!before) return undefined;
  const quality = judgement(after, undefined, uci, side)?.quality;
  const good = quality === 'best' || quality === 'good';
  const base = forSide(before.lines[0].evaluation.score, side);
  return good && forSide(after.lines[rank].evaluation.score, side) - base >= MISTAKE_LOSS;
}
