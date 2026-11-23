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
import { SquareSet } from 'chessops/squareSet';

import { VALUES } from '@/game/material';
import { opposite, takenRole, withTurn } from '@/game/replay';

/** A piece's value in pawns (`VALUES`); the king is never taken. */
const value = (role: Role) => (role === 'king' ? 0 : VALUES[role]);

/** The king's cost as a capturer: more than any piece, so it captures last. */
const KING_LAST = 100;

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
  return Math.max(0, value(target.role) + promotionGain(capture) - exchangeGain(next, square));
}

/**
 * What `move`, legal in `before`, gives up: the most the opponent then wins
 * on a square holding one of the mover's pieces (not a pawn), beyond what
 * they could already win from that piece where it stood, less what the move
 * itself took. Example: a knight a pawn attacks that takes a pawn on its way
 * out gives up nothing, since it was lost anyway; but a quiet move that
 * leaves a knight to be taken gives it up, even with a rook hanging
 * elsewhere.
 */
export function materialGivenUp(before: Chess, move: NormalMove): number {
  const after = playing(before, move);
  // The pieces a sacrifice gives up: anything but pawns and the king.
  const pieces = after.board[before.turn].diff(after.board.pawn).diff(after.board.king);
  let given = 0;
  for (const square of pieces) {
    const now = exchangeGain(after, square);
    if (now <= given) continue;
    const stood = square === move.to ? move.from : square;
    given = Math.max(given, now - atStake(before, stood));
  }
  return Math.max(0, given - moveGain(before, move));
}

/**
 * Whether `move`, legal in `before`, is a capture that simply wins material:
 * it takes more than the opponent can win back on its square.
 */
export const winsMaterial = (before: Chess, move: NormalMove) =>
  !!takenRole(before, move) &&
  moveGain(before, move) > exchangeGain(playing(before, move), move.to);

/**
 * Whether `move` takes back on the square where `previous`, the opponent's
 * move just before it from `previousPos`, captured.
 */
export const recaptures = (previousPos: Chess, previous: NormalMove, move: NormalMove) =>
  move.to === previous.to && !!takenRole(previousPos, previous);

/**
 * Whether the piece on `square`, the mover's in `pos`, was about to be lost
 * there: the opponent, were it their move, would win something taking it.
 */
export const hanging = (pos: Chess, square: Square) => atStake(pos, square) > 0;

/**
 * What the opponent would win taking the piece on `square`, the mover's in
 * `pos`, were it their move. In check that position isn't legal, so nothing
 * is at stake.
 */
const atStake = (pos: Chess, square: Square) =>
  pos.isCheck() ? 0 : exchangeGain(withTurn(pos, opposite(pos.turn)), square);

/** `pos` after `move`, leaving `pos` as it was. */
function playing(pos: Chess, move: NormalMove): Chess {
  const after = pos.clone();
  after.play(move);
  return after;
}

/** What `move`, legal in `pos`, takes, and what a promotion adds. */
const moveGain = (pos: Chess, move: NormalMove) => {
  const taken = takenRole(pos, move);
  return (taken ? value(taken) : 0) + promotionGain(move);
};

const promotionGain = ({ promotion }: NormalMove) =>
  promotion ? value(promotion) - VALUES.pawn : 0;

/** The side to move's legal capture on `square` with its cheapest piece, the king last. */
function cheapestCapture(pos: Chess, square: Square): NormalMove | undefined {
  // Only the pieces attacking the square can capture there; most squares have none.
  const attackers = pos.kingAttackers(square, pos.turn, pos.board.occupied);
  if (attackers.isEmpty()) return undefined;
  const ctx = pos.ctx();
  let cheapest: NormalMove | undefined;
  let cheapestCost = Infinity;
  for (const from of attackers) {
    const role = pos.board.getRole(from)!;
    const cost = role === 'king' ? KING_LAST : value(role);
    if (cost < cheapestCost && pos.dests(from, ctx).has(square)) {
      const promotes = role === 'pawn' && SquareSet.backranks().has(square);
      cheapest = { from, to: square, ...(promotes && { promotion: 'queen' as const }) };
      cheapestCost = cost;
    }
  }
  return cheapest;
}
