/**
 * Which position the review asks Stockfish for next: a pure function of the
 * game and the analyses in the store, so there is no queue to keep in step.
 * When an analysis arrives the answer changes by itself, and the page asks
 * for the new one; the engine stops a search nobody watches any more.
 */
import { type Analysis, scoreFor } from '@/evaluation/evaluation';
import type { Color } from '@/game/replay';

import { judgedPosition, type ReviewMove } from './review';

/**
 * How deep a sketch goes: the first whole depth of at least this (about 0.3 s
 * on a desktop). Sketches draw the graph and pick which positions to search
 * in full first; they never label a move.
 */
export const SKETCH_DEPTH = 12;

/**
 * A search that has finished this depth without being final is running, or
 * ran, in full, rather than a sketch that stopped at `SKETCH_DEPTH` (or the
 * next depth or two, when one isn't whole): it's kept on until it's final,
 * so a ranking that shifts as its lines deepen doesn't stop it halfway.
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
  /** The ply the board shows. */
  readonly shown: number;
}

/**
 * The ply of the position to search next, or undefined once nothing is
 * left. In order:
 *
 * 1. The positions the board's move is judged from, so the move shown gets
 *    its label first.
 * 2. A search already running in full (`RUNNING_DEPTH`).
 * 3. A sketch of every position, in game order, so the graph draws left to
 *    right.
 * 4. In full, the positions around the learner's biggest drops in the
 *    sketch, largest first: their worst moves are confirmed first.
 * 5. In full, the rest, in game order.
 *
 * Only the positions a move the guide doesn't recommend touches are searched
 * in full (`judgedPosition`); a position the store has final is skipped.
 */
export function nextSearch({
  moves,
  book,
  analyses,
  learner,
  shown,
}: OrderInput): number | undefined {
  const count = moves.length;
  const unfinished = (ply: number) => judgedPosition(book, ply, count) && !analyses[ply]?.final;
  const shownMove = moves[shown - 1];
  const board = shownMove && !book[shown - 1] && !shownMove.forced ? [shown - 1, shown] : [];
  const plies = Array.from({ length: count + 1 }, (_, ply) => ply);
  return (
    board.find(unfinished) ??
    plies.find((ply) => unfinished(ply) && (analyses[ply]?.depth ?? 0) >= RUNNING_DEPTH) ??
    plies.find((ply) => !sketched(analyses[ply])) ??
    worstFirst(moves, analyses, learner)
      .flatMap(({ ply }) => [ply, ply + 1])
      .find(unfinished) ??
    plies.find(unfinished)
  );
}

/** Whether `analysis` is at least a sketch. */
const sketched = (analysis: Analysis | undefined) =>
  !!analysis && (analysis.final || analysis.depth >= SKETCH_DEPTH);

/**
 * The learner's moves that drop at least `LEAST_DROP` by the analyses so far
 * (the first line before the move against the first line after it), largest
 * drop first.
 */
function worstFirst(
  moves: readonly ReviewMove[],
  analyses: readonly (Analysis | undefined)[],
  learner: Color,
): { ply: number; drop: number }[] {
  return moves
    .flatMap(({ ply, mover, quality, forced }) => {
      const before = analyses[ply]?.lines[0];
      const after = analyses[ply + 1]?.lines[0];
      if (mover !== learner || forced || quality === 'book' || !before || !after) return [];
      const drop = scoreFor(before.evaluation, mover) - scoreFor(after.evaluation, mover);
      return drop >= LEAST_DROP ? [{ ply, drop }] : [];
    })
    .sort((a, b) => b.drop - a.drop);
}
