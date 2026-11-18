/**
 * How Maia's network names moves. Maia is a Leela Chess Zero network, and lc0
 * scores every move in a fixed vocabulary of 1858 moves, written from the
 * side to move's point of view (so Black's moves are mirrored to look like
 * White's). Castling is the king taking its own rook (`e1h1`), and a
 * promotion to a knight is the plain pawn move (`a7a8`).
 */

import type { NormalMove } from 'chessops/types';
import { makeSquare, roleToChar } from 'chessops/util';

const KNIGHT_JUMPS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const DIRECTIONS = [
  [0, 1],
  [1, 1],
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];

/**
 * The network's convolutional policy head scores moves as 64 squares (where
 * a move starts) by planes (what kind of move it is): 56 queen moves (eight
 * directions, one to seven squares), 8 knight jumps, then promotions to a
 * rook, bishop or queen capturing left, straight or capturing right.
 */
function policyPlane(df: number, dr: number, promotion: string): number {
  if (promotion) return 64 + (df + 1) * 3 + 'rbq'.indexOf(promotion);
  const jump = KNIGHT_JUMPS.findIndex(([f, r]) => f === df && r === dr);
  if (jump >= 0) return 56 + jump;
  const distance = Math.max(Math.abs(df), Math.abs(dr));
  const direction = DIRECTIONS.findIndex(
    ([f, r]) => f === df / distance && r === dr / distance,
  );
  return direction * 7 + distance - 1;
}

const slot = (from: number, to: number, promotion = '') =>
  policyPlane((to % 8) - (from % 8), Math.floor(to / 8) - Math.floor(from / 8), promotion) * 64 +
  from;

/**
 * lc0's move names, each with where its score sits in the network's policy
 * output (plane * 64 + origin square).
 */
export const POLICY_SLOTS: ReadonlyMap<string, number> = (() => {
  const slots = new Map<string, number>();
  // Every queen or knight move from each square.
  for (let from = 0; from < 64; from++) {
    for (let to = 0; to < 64; to++) {
      const df = Math.abs((to % 8) - (from % 8));
      const dr = Math.abs(Math.floor(to / 8) - Math.floor(from / 8));
      const queen = to !== from && (df === 0 || dr === 0 || df === dr);
      const knight = df * dr === 2;
      if (queen || knight) slots.set(makeSquare(from) + makeSquare(to), slot(from, to));
    }
  }
  // Promotions to a queen, rook or bishop, from the 7th rank to the 8th.
  for (let from = 48; from < 56; from++) {
    for (const to of [from + 7, from + 8, from + 9]) {
      if (Math.abs((to % 8) - (from % 8)) > 1) continue;
      for (const piece of 'qrb') {
        slots.set(makeSquare(from) + makeSquare(to) + piece, slot(from, to, piece));
      }
    }
  }
  return slots;
})();

/**
 * Where a legal move's score sits in the network's policy output, or
 * undefined if lc0 has no name for it. Castling must be written as the king
 * taking its rook, as chessops writes it.
 */
export function policySlot(move: NormalMove, blackToMove: boolean): number | undefined {
  const mirror = blackToMove ? 56 : 0;
  const promotion =
    move.promotion && move.promotion !== 'knight' ? roleToChar(move.promotion) : '';
  return POLICY_SLOTS.get(
    makeSquare(move.from ^ mirror) + makeSquare(move.to ^ mirror) + promotion,
  );
}
