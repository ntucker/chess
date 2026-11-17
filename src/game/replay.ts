import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { makeSquare, parseSquare, parseUci } from 'chessops/util';

export type Color = 'white' | 'black';

/** One position in a game, as the board and the move list show it. */
export interface Ply {
  readonly fen: string;
  readonly turn: Color;
  /** Legal moves by origin square; empty once the game is over. */
  readonly dests: Record<string, string[]>;
  readonly check: boolean;
  /** The move that led here: absent for the starting position. */
  readonly move?: {
    readonly uci: string;
    readonly san: string;
    readonly from: string;
    readonly to: string;
  };
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
  const plies: Ply[] = [describe(pos, seen)];
  for (const uci of line) {
    const move = parseUci(uci);
    if (!move || !('from' in move) || !pos.isLegal(move)) break;
    const from = makeSquare(move.from);
    const to = makeSquare(move.to);
    const san = makeSanAndPlay(pos, move);
    plies.push(describe(pos, seen, { uci, san, from, to }));
  }
  return plies;
}

function describe(
  pos: Chess,
  seen: Map<string, number>,
  move?: Ply['move'],
): Ply {
  const fen = makeFen(pos.toSetup());
  // Repetition compares placement, turn, castling and en passant: the FEN
  // without its move counters.
  const key = fen.split(' ').slice(0, 4).join(' ');
  const repetitions = (seen.get(key) ?? 0) + 1;
  seen.set(key, repetitions);

  const result = gameResult(pos, repetitions);
  return {
    fen,
    turn: pos.turn,
    dests: result ? {} : Object.fromEntries(chessgroundDests(pos)),
    check: pos.isCheck(),
    move,
    result,
  };
}

function gameResult(pos: Chess, repetitions: number): GameResult | undefined {
  if (pos.isCheckmate())
    return { winner: pos.turn === 'white' ? 'black' : 'white', reason: 'checkmate' };
  if (pos.isStalemate()) return { reason: 'stalemate' };
  if (pos.isInsufficientMaterial()) return { reason: 'insufficient material' };
  if (repetitions >= 3) return { reason: 'threefold repetition' };
  if (pos.halfmoves >= 100) return { reason: 'fifty-move rule' };
  return undefined;
}

/** The UCI for a move between two squares, promoting pawns to queens. */
export function toUci(ply: Ply, from: string, to: string): string {
  const square = parseSquare(from);
  const piece =
    square === undefined ? undefined : parseFen(ply.fen).unwrap().board.get(square);
  const promotes = piece?.role === 'pawn' && (to[1] === '8' || to[1] === '1');
  return `${from}${to}${promotes ? 'q' : ''}`;
}
