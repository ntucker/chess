/**
 * Material a move gives up, counted as a static exchange: on one square, each
 * side captures with its cheapest piece and stops once going on would lose.
 * Example: a bishop on h7 that a king can take is given up (3 for the
 * bishop); a knight on e5 that a pawn attacks but a pawn defends is not,
 * since taking it with a rook would lose the rook for the knight.
 * Captures are the legal ones, so a pinned piece doesn't capture and a king
 * never takes a defended piece. Brilliant and Great read this (`refine.ts`).
 */
import type { Chess } from 'chessops/chess';
import type { NormalMove, Role, Square } from 'chessops/types';
import { parseUci } from 'chessops/util';

import { opposite, takenRole, withTurn } from '@/game/replay';

/** Pieces in pawns, as players count them. The king is never taken. */
const VALUE: Readonly<Record<Role, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
  king: 0,
};

/** The pieces a sacrifice gives up: anything but pawns and the king. */
const PIECES: readonly Role[] = ['knight', 'bishop', 'rook', 'queen'];

/**
 * How much the side to move in `pos` wins by capturing on `square`, trading
 * on it while that pays: 0 when no capture there wins anything. A pawn
 * capturing onto its last rank becomes a queen.
 */
export function exchangeGain(pos: Chess, square: Square): number {
  const target = pos.board.get(square);
  if (!target || target.color === pos.turn) return 0;
  const capture = cheapestCapture(pos, square);
  if (!capture) return 0;
  const next = pos.clone();
  next.play(capture);
  return Math.max(0, VALUE[target.role] + promotionGain(capture) - exchangeGain(next, square));
}

/**
 * What the move `uci`, legal in `before`, gives up: the most the opponent
 * then wins on any square holding one of the mover's pieces (not a pawn),
 * less what the move itself took. It gives up nothing when that piece was
 * already as good as lost before the move: a knight a pawn attacks that takes
 * a pawn on its way out gives up nothing, since it was lost anyway.
 */
export function materialGivenUp(before: Chess, uci: string): number {
  const move = parseUci(uci) as NormalMove;
  const after = before.clone();
  after.play(move);
  const lost = mostAtStake(after);
  // A move out of check had nothing at stake before: the opponent wasn't to move.
  const lostAnyway = before.isCheck() ? 0 : mostAtStake(withTurn(before, after.turn));
  return lost > lostAnyway ? Math.max(0, lost - moveGain(before, move)) : 0;
}

/**
 * Whether the move `uci`, legal in `before`, simply wins material: it takes
 * more than the opponent can win back on its square.
 */
export function winsMaterial(before: Chess, uci: string): boolean {
  const move = parseUci(uci) as NormalMove;
  const after = before.clone();
  after.play(move);
  return moveGain(before, move) > exchangeGain(after, move.to);
}

/**
 * Whether the piece on `square`, the mover's in `pos`, was about to be lost
 * there: the opponent, were it their move, would win something taking it.
 */
export const hanging = (pos: Chess, square: Square) =>
  !pos.isCheck() && exchangeGain(withTurn(pos, opposite(pos.turn)), square) > 0;

/** The most the side to move in `pos` wins on one square holding an opposing piece (not a pawn). */
function mostAtStake(pos: Chess): number {
  const theirs = pos.board[opposite(pos.turn)];
  let most = 0;
  for (const role of PIECES) {
    for (const square of pos.board[role].intersect(theirs)) {
      most = Math.max(most, exchangeGain(pos, square));
    }
  }
  return most;
}

/** What `move`, legal in `pos`, takes, and what a promotion adds. */
const moveGain = (pos: Chess, move: NormalMove) => {
  const taken = takenRole(pos, move);
  return (taken ? VALUE[taken] : 0) + promotionGain(move);
};

const promotionGain = ({ promotion }: NormalMove) =>
  promotion ? VALUE[promotion] - VALUE.pawn : 0;

/** The side to move's legal capture on `square` with its cheapest piece, the king last. */
function cheapestCapture(pos: Chess, square: Square): NormalMove | undefined {
  let cheapest: NormalMove | undefined;
  let cheapestCost = Infinity;
  for (const [from, dests] of pos.allDests()) {
    if (!dests.has(square)) continue;
    const role = pos.board.getRole(from)!;
    const cost = role === 'king' ? 100 : VALUE[role];
    if (cost < cheapestCost) {
      const promotes = role === 'pawn' && (square < 8 || square >= 56);
      cheapest = { from, to: square, ...(promotes && { promotion: 'queen' as const }) };
      cheapestCost = cost;
    }
  }
  return cheapest;
}
