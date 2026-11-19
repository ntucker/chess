/**
 * Pawn-structure facts computed from the pawns alone: what `Structure` and
 * `Imbalance` ideas claim, so the checker can test the claim and the board
 * can mark it. Every function takes a chessops board and square numbers.
 */
import { pawnAttacks } from 'chessops/attacks';
import type { Board } from 'chessops/board';
import { SquareSet } from 'chessops/squareSet';
import type { Color, Square } from 'chessops/types';
import { opposite, squareFile, squareFromCoords, squareRank } from 'chessops/util';

/** The rank counted from `color`'s side: 0 is its back rank. */
export const relativeRank = (color: Color, square: Square) =>
  color === 'white' ? squareRank(square) : 7 - squareRank(square);

const pawns = (board: Board, color: Color) => board.pieces(color, 'pawn');

/** How many pawns `color` has on the file numbered `file` (0 is the a-file). */
export const filePawnCount = (board: Board, color: Color, file: number) =>
  pawns(board, color).intersect(SquareSet.fromFile(file)).size();

/** The square in front of a `color` pawn on `square`, if any. */
export const stopSquare = (color: Color, square: Square) =>
  squareFromCoords(squareFile(square), squareRank(square) + (color === 'white' ? 1 : -1));

/**
 * The squares a `color` pawn on `square` can move to on `board`: forward to
 * empty squares (two from its starting rank) and diagonally onto enemy pieces.
 */
export function pawnSteps(board: Board, color: Color, square: Square): Square[] {
  const steps: Square[] = [];
  const one = stopSquare(color, square);
  if (one !== undefined && !board.has(one)) {
    steps.push(one);
    const two = stopSquare(color, one);
    if (relativeRank(color, square) === 1 && two !== undefined && !board.has(two)) steps.push(two);
  }
  return steps.concat([...pawnAttacks(color, square).intersect(board[opposite(color)])]);
}

/** `color`'s pawns on the files next to `square`'s. */
const adjacentFilePawns = (board: Board, color: Color, square: Square) =>
  [...pawns(board, color)].filter((pawn) => Math.abs(squareFile(pawn) - squareFile(square)) === 1);

/** A pawn of `color` attacks `square` now. */
const guardedByPawn = (board: Board, color: Color, square: Square) =>
  pawnAttacks(opposite(color), square).intersects(pawns(board, color));

/** A pawn of `color` could still attack `square` some day by moving up. */
const pawnCanReach = (board: Board, color: Color, square: Square) =>
  adjacentFilePawns(board, color, square).some((pawn) => relativeRank(color, pawn) < relativeRank(color, square));

/** No pawn of the same color on a neighboring file. */
export const isIsolated = (board: Board, color: Color, square: Square) =>
  adjacentFilePawns(board, color, square).length === 0;

/** No enemy pawn ahead of it on its own or a neighboring file. */
export function isPassed(board: Board, color: Color, square: Square): boolean {
  const file = squareFile(square);
  const rank = relativeRank(color, square);
  return [...pawns(board, opposite(color))].every(
    (enemy) => Math.abs(squareFile(enemy) - file) > 1 || relativeRank(color, enemy) <= rank,
  );
}

/**
 * No pawn of the same color on a neighboring file level with it or behind
 * it, and an enemy pawn guards the square in front of it.
 */
export function isBackward(board: Board, color: Color, square: Square): boolean {
  const rank = relativeRank(color, square);
  if (adjacentFilePawns(board, color, square).some((pawn) => relativeRank(color, pawn) <= rank)) return false;
  const stop = stopSquare(color, square);
  return stop !== undefined && guardedByPawn(board, opposite(color), stop);
}

/**
 * A hole in `color`'s camp: a square on its third to sixth rank that none of
 * its pawns can ever guard again.
 */
export function isWeakSquare(board: Board, color: Color, square: Square): boolean {
  const rank = relativeRank(color, square);
  return rank >= 2 && rank <= 5 && !pawnCanReach(board, color, square);
}

/** A square for `color`'s pieces: guarded by its pawn, out of enemy pawns' reach. */
export function isOutpost(board: Board, color: Color, square: Square): boolean {
  return guardedByPawn(board, color, square) && !pawnCanReach(board, opposite(color), square);
}

/** The squares hold pawns of `color`, each one diagonally in front of the last. */
export function isPawnChain(board: Board, color: Color, squares: readonly Square[]): boolean {
  if (squares.length < 2 || !squares.every((square) => pawns(board, color).has(square))) {
    return false;
  }
  const ordered = [...squares].sort((a, b) => relativeRank(color, a) - relativeRank(color, b));
  return ordered.every(
    (square, i) =>
      i === 0 ||
      (Math.abs(squareFile(square) - squareFile(ordered[i - 1])) === 1 &&
        relativeRank(color, square) - relativeRank(color, ordered[i - 1]) === 1),
  );
}

/** The opponent's half of the board for `color`: ranks 5 to 8 for White, 1 to 4 for Black. */
const opponentHalf = (color: Color) =>
  [4, 5, 6, 7].reduce(
    (set, rank) => set.union(SquareSet.fromRank(color === 'white' ? rank : 7 - rank)),
    SquareSet.empty(),
  );

/**
 * `color`'s space: the squares in the opponent's half of the board that its
 * pawns attack. A side with more of them has the space advantage.
 */
export const spaceSquares = (board: Board, color: Color): SquareSet =>
  [...pawns(board, color)]
    .reduce((set, pawn) => set.union(pawnAttacks(color, pawn)), SquareSet.empty())
    .intersect(opponentHalf(color));
