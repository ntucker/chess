import { castlingSide, Chess } from 'chessops/chess';
import { chessgroundDests, chessgroundMove } from 'chessops/compat';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import type { Color, Piece, SquareName } from 'chessops/types';
import { kingCastlesTo, makeUci, opposite, parseSquare, parseUci } from 'chessops/util';

export { COLORS, type Color } from 'chessops/types';
export { opposite } from 'chessops/util';

/** One move in SAN, without annotation glyphs, as a regular expression source. */
export const SAN = String.raw`(?:O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8]|[a-h](?:x[a-h])?[1-8](?:=[QRBN])?)[+#]?`;

/** A move as text writes it, numbered or not, with any glyph: `6...Nd7`, `...Nd7`, `Nd7?`. */
export const WRITTEN_MOVE = String.raw`(?:\d+\s?\.(?:\.\.)?\s?|\.\.\.)?${SAN}[!?]*`;

/**
 * A move a variation name writes (`4.g4`, `...Bf5`, `5...Nh5`, `e5`), as a regular expression
 * source. Its groups: the number, `..` for a numbered Black move, `...` for an unnumbered one, and the SAN.
 * `...` may follow a word (`Qxd4...Qxd4`); a number or bare SAN may not.
 */
export const NAMED_MOVE = String.raw`(?:(?<![\w.])(\d+)\s?\.(\.\.)?\s?|(\.\.\.)|(?<![\w.]))(${SAN})`;

export const colorName = (color: Color) => (color === 'white' ? 'White' : 'Black');

/** `sans` numbered, the first played at `firstPly` (1 is White's first move): `1.e4 c6 2.d4`, or `2...d5 3.e5`. */
export function numberedLine(sans: readonly string[], firstPly = 1): string {
  return sans
    .map((san, i) => {
      const ply = firstPly + i;
      const number = Math.ceil(ply / 2);
      if (ply % 2 === 1) return `${number}.${san}`;
      return i === 0 ? `${number}...${san}` : san;
    })
    .join(' ');
}

/** One position in a game, as the move list shows it. */
export interface Ply {
  readonly fen: string;
  readonly turn: Color;
  /** The move that led here: absent for the starting position. */
  readonly move?: {
    readonly uci: string;
    readonly san: string;
    readonly from: SquareName;
    readonly to: SquareName;
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
 * `pos` as a FEN without the move counters (placement, turn, castling, and
 * en passant only when a capture there is legal): equal for the same position
 * however it was reached, so it counts repetitions and keys lessons.
 */
export function positionKey(pos: Chess): string {
  return makeFen(pos.toSetup(), { epd: true });
}

/** The position `fen` describes, or undefined if it is not a legal position. */
export function parsePosition(fen: string): Chess | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  return pos.isOk ? pos.value : undefined;
}

/** The position `key` (see `positionKey`) stands for, or undefined if it is not a position key. */
export function parsePositionKey(key: string): Chess | undefined {
  const pos = readPositionKey(key);
  return pos && positionKey(pos) === key ? pos : undefined;
}

/**
 * The position a key stands for, without checking that `positionKey` writes
 * it back the same: for keys already checked, such as a shipped lesson's.
 */
export const readPositionKey = (key: string) => parsePosition(`${key} 0 1`);

/** A position reached while playing a line (see `playLine`). */
export interface Step {
  /** The position. Every step shares one object, so read it before the next. */
  readonly pos: Chess;
  /** The position's key (see `positionKey`). */
  readonly key: string;
  /** How many times this position has occurred so far, counting this time. */
  readonly repetitions: number;
  /** The move that led here: absent for the starting position. */
  readonly move?: Ply['move'];
}

/**
 * Plays `line` (UCI moves) from `pos` (the starting position unless given,
 * and played on in place), yielding it and then the position after each move.
 * Stops early at the first move that isn't legal.
 */
export function* playLine(line: readonly string[], pos = Chess.default()): Generator<Step> {
  const seen = new Map<string, number>();
  const step = (move?: Ply['move']): Step => {
    const key = positionKey(pos);
    const repetitions = (seen.get(key) ?? 0) + 1;
    seen.set(key, repetitions);
    return { pos, key, repetitions, move };
  };

  yield step();
  for (const uci of line) {
    const move = playMove(pos, uci);
    if (!move) return;
    yield step(move);
  }
}

/**
 * Plays `uci` on `pos` and describes it as a ply records it, or returns
 * undefined, playing nothing, if it isn't legal there.
 */
export function playMove(pos: Chess, uci: string): Ply['move'] {
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return undefined;
  const [from, to] = chessgroundMove(move);
  const san = makeSanAndPlay(pos, move);
  return { uci, san, from, to };
}

/**
 * Every position of `line`, so that index `n` is the position after `n`
 * moves. Stops early at the first move that isn't legal.
 */
export function replay(line: readonly string[]): Ply[] {
  return Array.from(playLine(line), ({ pos, repetitions, move }) => ({
    fen: makeFen(pos.toSetup()),
    turn: pos.turn,
    move,
    repetitions,
  }));
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

/** The position after `line`, ready for the board. */
export function lastPosition(line: readonly string[]): Position {
  const plies = replay(line);
  return analyze(plies[plies.length - 1]);
}

/**
 * `uci` as a line records it, or undefined if it isn't legal in `fen`.
 * Castling is written as the king's two-square move (`e1g1`), whether it
 * comes that way or as the king taking its rook (`e1h1`), as Maia and a king
 * dragged onto its rook write it.
 */
export function lineMove(fen: string, uci: string): string | undefined {
  return recordedMove(Chess.fromSetup(parseFen(fen).unwrap()).unwrap(), uci);
}

/** `san` in `pos` as UCI, castling as the game records it (`recordedMove`), if legal. */
export function sanToUci(pos: Chess, san: string): string | undefined {
  const move = parseSan(pos, san);
  return move && recordedMove(pos, makeUci(move));
}

/** `lineMove` for a position already parsed. */
export function recordedMove(pos: Chess, uci: string): string | undefined {
  const move = parseUci(uci);
  if (!move || !pos.isLegal(move)) return undefined;
  const side = castlingSide(pos, move);
  if (!side || !('from' in move)) return uci;
  return makeUci({ from: move.from, to: kingCastlesTo(pos.turn, side) });
}

/** The piece on `square` (a name like `e4`) in `fen`, if any. */
export function pieceAt(fen: string, square: string): Piece | undefined {
  const index = parseSquare(square);
  return index === undefined ? undefined : parseFen(fen).unwrap().board.get(index);
}

/** The UCI for a move between two squares, promoting pawns to queens. */
export function toUci(ply: Ply, from: string, to: string): string {
  return promotingUci(ply.fen, from, to);
}

/**
 * The move a piece dropped from `from` onto `to` plays in `fen`, as a line
 * records it (`lineMove`), or undefined if it isn't legal. A pawn promotes
 * to a queen, and a king dropped on its rook castles: `e1h1` is `e1g1`.
 */
export function dropMove(fen: string, from: string, to: string): string | undefined {
  return lineMove(fen, promotingUci(fen, from, to));
}

function promotingUci(fen: string, from: string, to: string): string {
  const piece = pieceAt(fen, from);
  const promotes = piece?.role === 'pawn' && (to[1] === '8' || to[1] === '1');
  return `${from}${to}${promotes ? 'q' : ''}`;
}
