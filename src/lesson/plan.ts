/**
 * A Plan's routes played one after another on one board, ignoring the other
 * side (see `Plan` in ./lesson.ts). The checker (./check.ts) tests each route
 * on the board the earlier ones left; the board plays them back.
 */
import type { Board } from 'chessops/board';
import type { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import type { Square } from 'chessops/types';
import { kingCastlesTo, parseSquare, rookCastlesTo } from 'chessops/util';

import type { Plan } from './lesson';

/**
 * Where a plan stands as its routes are played on a copy of `pos`'s board.
 * `play` moves one route's piece, and its rook when the route is castling.
 */
export class PlanBoard {
  readonly board: Board;
  /** Squares earlier routes left: a king or rook that left can't castle. */
  private vacated = SquareSet.empty();

  constructor(private readonly pos: Chess) {
    this.board = pos.board.clone();
  }

  /** Plays the route `from`-`to` and says whether it was castling. */
  play(from: Square, to: Square): boolean {
    const rook = this.castlingRook(from, to);
    if (rook) this.board.set(rook.to, this.board.take(rook.from)!);
    this.board.set(to, this.board.take(from)!);
    this.vacated = this.vacated.with(from);
    return rook !== undefined;
  }

  /**
   * The rook's move when the king route `from`-`to` is castling that `pos`
   * allows and the board still does; or undefined.
   */
  private castlingRook(from: Square, to: Square) {
    const color = this.board.get(from)?.color;
    if (color === undefined || this.board.getRole(from) !== 'king') return undefined;
    const side = to > from ? 'h' : 'a';
    const rook = this.pos.castles.rook[color][side];
    // Only the king that has not moved yet, from its square in `pos`, castles.
    const king = this.pos.board.kingOf(color);
    if (rook === undefined || from !== king || this.vacated.has(king) || this.vacated.has(rook)) {
      return undefined;
    }
    if (kingCastlesTo(color, side) !== to) return undefined;
    if (this.pos.castles.path[color][side].intersects(this.board.occupied)) return undefined;
    return { from: rook, to: rookCastlesTo(color, side) };
  }
}

/**
 * The board before `plan` and after each of its routes: `routes.length + 1`
 * boards. `plan` must have passed the checker.
 */
export function planBoards(pos: Chess, plan: Plan): Board[] {
  const played = new PlanBoard(pos);
  return [
    played.board.clone(),
    ...plan.routes.map(({ from, to }) => {
      played.play(parseSquare(from)!, parseSquare(to)!);
      return played.board.clone();
    }),
  ];
}
