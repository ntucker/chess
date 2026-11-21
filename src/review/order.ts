/**
 * Which position the review asks Stockfish for next: a pure function of the
 * game and the analyses in the store, so there is no queue to keep in step.
 * When an analysis arrives the answer changes by itself, and the page asks
 * for the new one; the engine stops a search nobody watches any more.
 */
import { type Analysis, forSide, isFinal } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

import { judgedPosition, type ReviewMove } from './review';

/**
 * How deep a sketch goes: the first whole depth of at least this (about 0.3 s
 * on a desktop). Sketches draw the graph and pick which positions to search
 * in full first; they never label a move.
 */
export const SKETCH_DEPTH = 12;

/**
 * A search past this depth that isn't final is a full one, kept on until
 * final so a ranking that shifts as its lines deepen doesn't stop it
 * halfway. Three depths of margin keep a sketch, which can overshoot
 * `SKETCH_DEPTH` by a depth or two, from passing for one.
 */
const RUNNING_DEPTH = SKETCH_DEPTH + 3;

/** The least a move's drop in the sketch puts it ahead of the rest: an inaccuracy's. */
const LEAST_DROP = 0.05;

/** What `nextSearch` decides from. */
export interface OrderInput {
  /** The game's moves as judged so far (`reviewMoves`). */
  readonly moves: readonly ReviewMove[];
  /** Whether the guide recommends each move (`bookMoves`). */
  readonly book: readonly boolean[];
  /** Whatever Stockfish's analysis of each position has reached in the store, final or not. */
  readonly analyses: readonly (Analysis | undefined)[];
  readonly learner: Color;
  /**
   * The ply the board has rested on for about a second, if any: stepping
   * through the moves doesn't restart the work, but staying on one does.
   */
  readonly dwelt?: number;
  /** Positions whose search the engine gave up on: skipped, so the rest go on. */
  readonly failed?: ReadonlySet<number>;
}

/**
 * The ply of the position to search next, or undefined once nothing is
 * left. In order:
 *
 * 1. The positions the label of the move the board rests on needs
 *    (`dwelt`), if it isn't judged yet.
 * 2. A search already running in full (`RUNNING_DEPTH`).
 * 3. A sketch of every position, in game order, so the graph draws left to
 *    right.
 * 4. In full, the positions the labels of the learner's biggest drops in
 *    the sketch need, largest first: their worst moves are confirmed first.
 * 5. In full, the rest, in game order.
 *
 * Only the positions a move the guide doesn't recommend touches are searched
 * in full (`judgedPosition`); a position the store has final, or whose
 * search failed, is skipped.
 */
export function nextSearch({
  moves,
  book,
  analyses,
  learner,
  dwelt,
  failed,
}: OrderInput): number | undefined {
  const count = moves.length;
  const searchable = (ply: number) => !failed?.has(ply);
  const unfinished = (ply: number) =>
    searchable(ply) && judgedPosition(book, ply, count) && !isFinal(analyses[ply]);
  const board =
    dwelt !== undefined && moves[dwelt - 1]?.status === 'waiting' ? labelPositions(dwelt - 1) : [];
  const positions = Array.from({ length: count + 1 }, (_, ply) => ply);
  return (
    board.find(unfinished) ??
    positions.find((ply) => unfinished(ply) && (analyses[ply]?.depth ?? 0) >= RUNNING_DEPTH) ??
    positions.find((ply) => searchable(ply) && !sketched(analyses[ply])) ??
    worstFirst(moves, analyses, learner).flatMap(labelPositions).find(unfinished) ??
    positions.find(unfinished)
  );
}

/**
 * The positions the label of the move from position `ply` needs, in order:
 * the one before it, the one after it, and the one before the opponent's
 * previous move, which Miss reads.
 */
const labelPositions = (ply: number) => (ply > 0 ? [ply, ply + 1, ply - 1] : [ply, ply + 1]);

/** Whether `analysis` is at least a sketch. */
const sketched = (analysis: Analysis | undefined) =>
  !!analysis && (analysis.final || analysis.depth >= SKETCH_DEPTH);

/**
 * The plies of the learner's moves that drop at least `LEAST_DROP` by the
 * analyses so far, largest drop first.
 */
function worstFirst(
  moves: readonly ReviewMove[],
  analyses: readonly (Analysis | undefined)[],
  learner: Color,
): number[] {
  return moves
    .flatMap(({ ply, mover, status }) => {
      const before = analyses[ply]?.lines[0];
      const after = analyses[ply + 1]?.lines[0];
      if (mover !== learner || status === 'book' || status === 'forced' || !before || !after) {
        return [];
      }
      // Negated rather than `scoreFor`, as labels measure it, so a drop at the limit agrees with them.
      const drop = forSide(before.evaluation.score - after.evaluation.score, mover);
      return drop >= LEAST_DROP ? [{ ply, drop }] : [];
    })
    .sort((a, b) => b.drop - a.drop)
    .map(({ ply }) => ply);
}
