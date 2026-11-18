import { castlingSide, Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Color, Role } from 'chessops/types';
import { makeUci, parseUci } from 'chessops/util';

import { INPUT_PLANES, type MaiaNetwork } from './network';
import { POLICY_OUTPUT_INDEX, policyIndex } from './policy';

export { MaiaNetwork } from './network';

const HISTORY = 8;
const ROLES: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

interface Seen {
  readonly pos: Chess;
  /** Whether this position occurred earlier in the game. */
  readonly repeated: boolean;
}

/**
 * Maia's move after `line` (UCI moves from the starting position), in UCI
 * (`e2e4`, `e1g1` to castle, `e7e8q`). Like Maia on lichess and maiachess.com,
 * it plays the move its network rates most likely for a person of its rating,
 * without searching.
 */
export function chooseMove(network: MaiaNetwork, line: readonly string[]): string {
  const history = playLine(line);
  const pos = history[history.length - 1].pos;
  const logits = network.policyLogits(encodeInput(history));

  let best: string | undefined;
  let bestScore = -Infinity;
  for (const [from, dests] of pos.allDests()) {
    const promotes =
      pos.board.get(from)?.role === 'pawn' && (pos.turn === 'white' ? from >= 48 : from < 16);
    for (const to of dests) {
      for (const promotion of promotes ? (['queen', 'rook', 'bishop', 'knight'] as const) : [undefined]) {
        // chessops, like lc0, writes castling as the king taking its rook.
        const move = { from, to, promotion };
        const index = policyIndex(makeUci(move), pos.turn === 'black');
        if (index === undefined) continue;
        const score = logits[POLICY_OUTPUT_INDEX[index]];
        if (score > bestScore) {
          bestScore = score;
          best = toStandardUci(pos, move);
        }
      }
    }
  }
  if (!best) throw new Error('Maia has no legal move');
  return best;
}

/** UCI for `move`, with castling as the king's two-square move (`e1g1`). */
function toStandardUci(pos: Chess, move: { from: number; to: number; promotion?: Role }) {
  const side = castlingSide(pos, move);
  if (!side) return makeUci(move);
  const rank = move.from & ~7;
  return makeUci({ from: move.from, to: rank + (side === 'h' ? 6 : 2) });
}

/** Every position of the game, from the start. */
function playLine(line: readonly string[]): Seen[] {
  const pos = Chess.default();
  const counts = new Map<string, number>();
  const seen = (): Seen => {
    const key = makeFen(pos.toSetup(), { epd: true });
    const count = counts.get(key) ?? 0;
    counts.set(key, count + 1);
    return { pos: pos.clone(), repeated: count > 0 };
  };
  const history = [seen()];
  for (const uci of line) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) throw new Error(`Illegal move ${uci}`);
    pos.play(move);
    history.push(seen());
  }
  return history;
}

/**
 * The network's input: 112 planes of 64 squares, as lc0 encodes them for
 * "classical" networks like Maia. Everything is seen from the side to move,
 * so for Black the board is mirrored top to bottom.
 *
 * - Planes 0-103: the last 8 positions, newest first, 13 planes each: the
 *   side to move's pawns, knights, bishops, rooks, queens and king, then the
 *   opponent's, then whether the position is a repetition. Positions before
 *   the game began are left empty.
 * - 104-107: whether the side to move can castle queenside, kingside, then
 *   the same for the opponent.
 * - 108: whether Black is to move. 109: moves since a capture or pawn move.
 *   110: zeros. 111: ones.
 */
export function encodeInput(history: readonly Seen[]): Float32Array {
  const planes = new Float32Array(INPUT_PLANES * 64);
  const current = history[history.length - 1].pos;
  const us: Color = current.turn;
  const them: Color = us === 'white' ? 'black' : 'white';
  const mirror = us === 'black' ? 56 : 0;
  const fill = (plane: number, value = 1) => planes.fill(value, plane * 64, plane * 64 + 64);

  for (let i = 0; i < HISTORY && i < history.length; i++) {
    const { pos, repeated } = history[history.length - 1 - i];
    const base = i * 13;
    ROLES.forEach((role, r) => {
      const pieces = pos.board.pieces(us, role);
      for (const square of pieces) planes[(base + r) * 64 + (square ^ mirror)] = 1;
      for (const square of pos.board.pieces(them, role)) {
        planes[(base + 6 + r) * 64 + (square ^ mirror)] = 1;
      }
    });
    if (repeated) fill(base + 12);
  }

  const rooks = current.castles.rook;
  if (rooks[us].a !== undefined) fill(104);
  if (rooks[us].h !== undefined) fill(105);
  if (rooks[them].a !== undefined) fill(106);
  if (rooks[them].h !== undefined) fill(107);
  if (us === 'black') fill(108);
  fill(109, current.halfmoves);
  fill(111);
  return planes;
}
