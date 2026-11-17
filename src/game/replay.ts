import { Chess } from 'chessops/chess';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import type { Color } from 'chessops/types';
import { opposite, parseSquare, parseUci } from 'chessops/util';

export { COLORS, type Color } from 'chessops/types';
export { opposite } from 'chessops/util';

export const colorName = (color: Color) => (color === 'white' ? 'White' : 'Black');

/** One position in a game, as the move list shows it. */
export interface Ply {
  readonly fen: string;
  readonly turn: Color;
  /** The move that led here: absent for the starting position. */
  readonly move?: {
    readonly uci: string;
    readonly san: string;
    readonly from: string;
    readonly to: string;
  };
  /** How many times this position has occurred so far, counting this time. */
  readonly repetitions: number;
}

/** A ply with what the board needs to show it (see `analyze`). */
export interface Position extends Ply {
  /** Legal moves by origin square; empty once the game is over. */
  readonly dests: Record<string, string[]>;
  readonly check: boolean;
  readonly result?: GameResult;
}

export interface GameResult {
  readonly winner?: Color;
  readonly reason:
    | 'checkmate'
    | 'stalemate'
    | 'insufficient material'
    | 'threefold repetition'
    | 'fifty-move rule';
}

/**
 * Plays `line` (UCI moves) from the starting position and returns every
 * position along the way, so that index `n` is the position after `n` moves.
 * Stops early at the first move that isn't legal.
 */
export function replay(line: readonly string[]): Ply[] {
  const pos = Chess.default();
  const seen = new Map<string, number>();
  const ply = (move?: Ply['move']): Ply => {
    // Repetition compares placement, turn, castling and en passant (EPD).
    const key = makeFen(pos.toSetup(), { epd: true });
    const repetitions = (seen.get(key) ?? 0) + 1;
    seen.set(key, repetitions);
    return { fen: makeFen(pos.toSetup()), turn: pos.turn, move, repetitions };
  };

  const plies = [ply()];
  for (const uci of line) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) break;
    const [from, to] = chessgroundMove(move);
    const san = makeSanAndPlay(pos, move);
    plies.push(ply({ uci, san, from, to }));
  }
  return plies;
}

/** Adds the legal moves, check and result, which cost a move search each. */
export function analyze(ply: Ply): Position {
  const pos = Chess.fromSetup(parseFen(ply.fen).unwrap()).unwrap();
  const result = gameResult(pos, ply.repetitions);
  return {
    ...ply,
    dests: result ? {} : Object.fromEntries(chessgroundDests(pos)),
    check: pos.isCheck(),
    result,
  };
}

function gameResult(pos: Chess, repetitions: number): GameResult | undefined {
  if (pos.isCheckmate()) return { winner: opposite(pos.turn), reason: 'checkmate' };
  if (pos.isStalemate()) return { reason: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { reason: 'insufficient material' };
  if (repetitions >= 3) return { reason: 'threefold repetition' };
  if (pos.halfmoves >= 100) return { reason: 'fifty-move rule' };
  return undefined;
}

/** Whether `uci` is a legal move in the position `fen`. */
export function isLegal(fen: string, uci: string): boolean {
  const move = parseUci(uci);
  return !!move && Chess.fromSetup(parseFen(fen).unwrap()).unwrap().isLegal(move);
}

/** The UCI for a move between two squares, promoting pawns to queens. */
export function toUci(ply: Ply, from: string, to: string): string {
  const square = parseSquare(from);
  const piece =
    square === undefined ? undefined : parseFen(ply.fen).unwrap().board.get(square);
  const promotes = piece?.role === 'pawn' && (to[1] === '8' || to[1] === '1');
  return `${from}${to}${promotes ? 'q' : ''}`;
}
