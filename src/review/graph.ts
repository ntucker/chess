/**
 * The review's graph of the game, as pure functions: how each position
 * stands, the moments it marks, how far the guide went, and which move a
 * point along it names. `ReviewGraph` draws them.
 */
import type { MoveQuality } from '@/analysis/quality';
import { type Analysis, scoreFor } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

import { worstFirst } from './order';
import type { ReviewMove } from './review';

/** How close (px) a point along the graph comes to a moment's dot before it lands on it. */
export const SNAP_PX = 8;

/**
 * The expected score (0 to 1) of the side drawn at the top (`top`) at each
 * position, by the deepest analysis the store has, a sketch or final;
 * undefined where none has arrived yet.
 */
export const topShares = (analyses: readonly (Analysis | undefined)[], top: Color) =>
  analyses.map((analysis) => {
    const best = analysis?.lines[0];
    return best && scoreFor(best.evaluation, top);
  });

/**
 * A dot on the graph, at the board's ply after one of the learner's moves.
 * A moment carries its move's label once it has one; a move not judged yet
 * has none and is drawn as a ring.
 */
export interface GraphMark {
  readonly ply: number;
  readonly quality?: MoveQuality;
}

/**
 * The graph's dots, in game order: each of the learner's moments (`moments`,
 * board plies), and the moves not judged yet whose drop in the analyses so
 * far is big enough to be one (`worstFirst`), the likely moments.
 */
export function graphMarks(
  moves: readonly ReviewMove[],
  analyses: readonly (Analysis | undefined)[],
  learner: Color,
  moments: readonly number[],
): GraphMark[] {
  const likely = worstFirst(moves, analyses, learner)
    .filter((ply) => moves[ply].status === 'waiting')
    .map((ply) => ply + 1);
  return [...new Set([...moments, ...likely])]
    .sort((a, b) => a - b)
    .map((ply) => ({ ply, quality: moves[ply - 1]?.quality }));
}

/**
 * The ply the guide's band ends at: the position after the guide's last move
 * before the learner's first move that isn't the guide's (`book`), or 0 when
 * the guide recommends none. The opponent's moves may not be the guide's
 * (a lesson for Black recommends only Black's moves), so they don't end it.
 */
export function guideEnd(book: readonly boolean[], learner: Color): number {
  const learners = (ply: number) => (ply % 2 === 0) === (learner === 'white');
  const left = book.findIndex((recommended, ply) => learners(ply) && !recommended);
  return book.slice(0, left === -1 ? undefined : left).lastIndexOf(true) + 1;
}

/** `n` to three decimals, which keeps an outline short. Above `topArea`: a worklet's helpers have to be defined before it. */
function round(n: number) {
  'worklet';
  return Math.round(n * 1000) / 1000;
}

/**
 * The outline of the area of the side at the top, in a box one unit a ply
 * wide and 1 tall: from the top edge down to its expected score (`shares`)
 * at each position. A worklet, so the UI thread draws it while the scores
 * spring from a sketch to the final analysis.
 */
export function topArea(shares: readonly number[]): string {
  'worklet';
  let outline = 'M0 0';
  for (let ply = 0; ply < shares.length; ply++) outline += ` L${ply} ${round(shares[ply])}`;
  return `${outline} L${shares.length - 1} 0 Z`;
}

/**
 * The stretches of the game no analysis has read yet, as [from, to] plies:
 * each from the last position read before it (or the start) to the first
 * read after it (or the end), so the hatch covers the line drawn across it.
 */
export function unreadSpans(shares: readonly (number | undefined)[]): [number, number][] {
  const spans: [number, number][] = [];
  const total = shares.length - 1;
  let from: number | undefined;
  shares.forEach((share, ply) => {
    if (share === undefined) from ??= Math.max(0, ply - 1);
    else if (from !== undefined) {
      spans.push([from, ply]);
      from = undefined;
    }
  });
  if (from !== undefined) spans.push([from, total]);
  return spans;
}

/**
 * The ply a point `x` px along a graph `width` px wide names, in a game of
 * `total` moves: the nearest position, or a moment's (`snaps`) within
 * `SNAP_PX`, so a moment is easy to land on. A worklet, so the UI thread
 * runs it while a finger drags.
 */
export function plyAt(x: number, width: number, total: number, snaps: readonly number[]): number {
  'worklet';
  if (total <= 0 || width <= 0) return 0;
  const step = width / total;
  let ply = Math.min(total, Math.max(0, Math.round(x / step)));
  let nearest = SNAP_PX;
  for (const snap of snaps) {
    const distance = Math.abs(snap * step - x);
    if (distance <= nearest) {
      nearest = distance;
      ply = snap;
    }
  }
  return ply;
}
