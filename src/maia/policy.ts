/**
 * How Maia's network names moves. Maia is a Leela Chess Zero network, and lc0
 * scores every move in a fixed vocabulary of 1858 moves, written from the
 * side to move's point of view (so Black's moves are mirrored to look like
 * White's). Castling is the king taking its own rook (`e1h1`), and a
 * promotion to a knight is the plain pawn move (`a7a8`).
 */
const FILES = 'abcdefgh';
const squareName = (square: number) => `${FILES[square % 8]}${Math.floor(square / 8) + 1}`;

/** The vocabulary, in lc0's order. */
export const POLICY_MOVES: readonly string[] = (() => {
  const moves: string[] = [];
  // Every queen or knight move from each square, by origin then destination.
  for (let from = 0; from < 64; from++) {
    for (let to = 0; to < 64; to++) {
      const df = Math.abs((to % 8) - (from % 8));
      const dr = Math.abs(Math.floor(to / 8) - Math.floor(from / 8));
      const queen = to !== from && (df === 0 || dr === 0 || df === dr);
      const knight = df * dr === 2;
      if (queen || knight) moves.push(squareName(from) + squareName(to));
    }
  }
  // Then promotions to a queen, rook or bishop from the 7th rank.
  for (let file = 0; file < 8; file++) {
    for (const toFile of [file - 1, file, file + 1]) {
      if (toFile < 0 || toFile > 7) continue;
      for (const piece of 'qrb') {
        moves.push(`${FILES[file]}7${FILES[toFile]}8${piece}`);
      }
    }
  }
  return moves;
})();

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

/**
 * Where each vocabulary move's score sits in the network's policy output
 * (plane * 64 + origin square), by its index in `POLICY_MOVES`.
 */
export const POLICY_OUTPUT_INDEX: Int16Array = Int16Array.from(POLICY_MOVES, (move) => {
  const from = FILES.indexOf(move[0]) + 8 * (Number(move[1]) - 1);
  const to = FILES.indexOf(move[2]) + 8 * (Number(move[3]) - 1);
  const df = (to % 8) - (from % 8);
  const dr = Math.floor(to / 8) - Math.floor(from / 8);
  return policyPlane(df, dr, move.slice(4)) * 64 + from;
});

const VOCABULARY_INDEX = new Map(POLICY_MOVES.map((move, i) => [move, i]));

/**
 * The index in `POLICY_MOVES` of a legal move, given as UCI with castling
 * as king takes rook, or undefined if lc0 has no name for it.
 */
export function policyIndex(uci: string, blackToMove: boolean): number | undefined {
  let move = uci.length === 5 && uci[4] === 'n' ? uci.slice(0, 4) : uci;
  if (blackToMove) {
    const mirror = (rank: string) => String(9 - Number(rank));
    move = move[0] + mirror(move[1]) + move[2] + mirror(move[3]) + move.slice(4);
  }
  return VOCABULARY_INDEX.get(move);
}
