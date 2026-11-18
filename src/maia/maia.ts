import type { Chess } from 'chessops/chess';
import { SquareSet } from 'chessops/squareSet';
import { type NormalMove, ROLES } from 'chessops/types';
import { makeUci, opposite } from 'chessops/util';

import type { Evaluation } from '@/evaluation/evaluation';
import { playLine } from '@/game/replay';

import type { MaiaRating } from './models';
import { INPUT_PLANES } from './network';
import { policySlot } from './policy';

const HISTORY = 8;
const PROMOTIONS = ['queen', 'rook', 'bishop', 'knight'] as const;

interface Seen {
  readonly pos: Chess;
  /** Whether this position occurred earlier in the game. */
  readonly repeated: boolean;
}

/**
 * The position after `line` (UCI moves from the starting position) and the
 * network's input for it.
 */
export function prepareInput(line: readonly string[]): { pos: Chess; planes: Float32Array } {
  const history = Array.from(playLine(line), ({ pos, repetitions }) => ({
    pos: pos.clone(),
    repeated: repetitions > 1,
  }));
  if (history.length <= line.length) throw new Error(`Illegal move ${line[history.length - 1]}`);
  return { pos: history[history.length - 1].pos, planes: encodeInput(history) };
}

/**
 * The legal move in `pos` that the network's `policy` output rates highest,
 * in UCI with castling as the king taking its rook (`e1h1`). Like Maia on
 * lichess and maiachess.com, this plays the move the network thinks a person
 * of its rating most likely plays, without searching.
 */
export function bestMove(pos: Chess, policy: Float32Array): string {
  let best: NormalMove | undefined;
  let bestScore = -Infinity;
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const promotes = pos.board.pawn.has(from) && SquareSet.backranks().has(to);
      for (const promotion of promotes ? PROMOTIONS : [undefined]) {
        const move = { from, to, promotion };
        const slot = policySlot(move, pos.turn === 'black');
        if (slot !== undefined && policy[slot] > bestScore) {
          bestScore = policy[slot];
          best = move;
        }
      }
    }
  }
  if (!best) throw new Error('Maia has no legal move');
  return makeUci(best);
}

/**
 * The network that judges positions for the evaluation bar. Of Maia's
 * networks, 1900's value head comes closest to Stockfish's evaluations, and
 * only it ships with one (VALUE_RATINGS in scripts/convert-maia.mjs).
 */
export const JUDGE_RATING: MaiaRating = 1900;

/**
 * How `pos` stands, from the network's output `wdl`: the side to move's
 * chances to win, draw and lose. Maia learned them from games between people
 * of its rating, so they say how such players tend to score from here. Pawns
 * come from the expected score the way Leela Chess Zero converts it
 * (`90 * tan(1.5637541897 * q)` centipawns, where q runs from -1 to 1).
 */
export function evaluation(pos: Chess, wdl: Float32Array): Evaluation {
  const [win, , loss] = wdl;
  const q = pos.turn === 'white' ? win - loss : loss - win;
  return { score: (1 + q) / 2, pawns: 0.9 * Math.tan(1.5637541897 * q) };
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
function encodeInput(history: readonly Seen[]): Float32Array {
  const planes = new Float32Array(INPUT_PLANES * 64);
  const current = history[history.length - 1].pos;
  const us = current.turn;
  const them = opposite(us);
  const mirror = us === 'black' ? 56 : 0;
  const fill = (plane: number, value = 1) => planes.fill(value, plane * 64, plane * 64 + 64);

  for (let i = 0; i < HISTORY && i < history.length; i++) {
    const { pos, repeated } = history[history.length - 1 - i];
    const base = i * 13;
    ROLES.forEach((role, r) => {
      for (const square of pos.board.pieces(us, role)) {
        planes[(base + r) * 64 + (square ^ mirror)] = 1;
      }
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
