/**
 * Who is ahead on material, the way lichess shows it beside each player:
 * pieces that both sides have lost cancel out, so each side keeps only the
 * pieces it is up, plus a points lead for the side ahead.
 */
import type { Board } from 'chessops/board';
import { parseFen } from 'chessops/fen';
import { opposite, parseSquare } from 'chessops/util';

import type { Color, Ply } from './replay';

/** The roles that count, most valuable first, as pieces are listed. */
const ROLES = ['queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
export type MaterialRole = (typeof ROLES)[number];

/** The usual piece values, in pawns. */
export const VALUES: Readonly<Record<MaterialRole, number>> = {
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};

/** The total value of `color`'s pieces on `board`, in pawns. */
export function points(board: Board, color: Color): number {
  return ROLES.reduce((sum, role) => sum + VALUES[role] * board.pieces(color, role).size(), 0);
}

/** How many points `color` is ahead on `board`; negative when behind. */
export function balance(board: Board, color: Color): number {
  return points(board, color) - points(board, opposite(color));
}

export interface Material {
  /** The other side's pieces this side is up, most valuable first. */
  readonly pieces: readonly MaterialRole[];
  /** This side's lead in points; 0 unless it is ahead. */
  readonly lead: number;
}

/**
 * Each side's material edge in the position `fen`. A promoted pawn counts as
 * the piece it became, so a queening shows as a queen up and a pawn down.
 */
export function material(fen: string): Readonly<Record<Color, Material>> {
  const { board } = parseFen(fen).unwrap();
  const up: Record<Color, MaterialRole[]> = { white: [], black: [] };
  /** White's lead in points; negative when Black leads. */
  const score = balance(board, 'white');
  for (const role of ROLES) {
    const diff = board.pieces('white', role).size() - board.pieces('black', role).size();
    for (let i = 0; i < Math.abs(diff); i++) up[diff > 0 ? 'white' : 'black'].push(role);
  }
  return {
    white: { pieces: up.white, lead: Math.max(0, score) },
    black: { pieces: up.black, lead: Math.max(0, -score) },
  };
}

/** The pieces each side has taken, most valuable first. */
export type Taken = Readonly<Record<Color, readonly MaterialRole[]>>;

/** What the name bars say of the pieces taken by a position in a game. */
export interface Captures {
  /** Each side's edge on the board (`material`). */
  readonly material: Readonly<Record<Color, Material>>;
  /** Everything each side has taken by then (`takenBy`). */
  readonly taken: Taken;
}

/** The captures by `plies[ply]`, the position after `ply` moves of the game `plies`. */
export function captures(plies: readonly Ply[], ply: number): Captures {
  return { material: material(plies[ply].fen), taken: takenBy(plies.slice(0, ply + 1)) };
}

/**
 * The pieces each side took over the moves of `plies`, each as it stood when
 * taken: a promoted pawn taken counts as the piece it became. Folded over the
 * moves, since a position can't tell: the starting set less what's left
 * lists a pawn nobody took after a promotion.
 */
export function takenBy(plies: readonly Ply[]): Taken {
  const taken: Record<Color, MaterialRole[]> = { white: [], black: [] };
  for (let n = 1; n < plies.length; n++) {
    const { move } = plies[n];
    if (!move) continue;
    const { board, turn } = parseFen(plies[n - 1].fen).unwrap();
    const role = capturedRole(board, turn, move.uci);
    if (role) taken[turn].push(role);
  }
  const byValue = (a: MaterialRole, b: MaterialRole) => ROLES.indexOf(a) - ROLES.indexOf(b);
  return { white: taken.white.sort(byValue), black: taken.black.sort(byValue) };
}

/** The role `mover`'s move `uci` takes on `board`, if it takes anything. */
function capturedRole(board: Board, mover: Color, uci: string): MaterialRole | undefined {
  const from = parseSquare(uci.slice(0, 2));
  const to = parseSquare(uci.slice(2, 4));
  if (from === undefined || to === undefined) return undefined;
  const target = board.get(to);
  // Castling written king-takes-rook lands on the mover's own rook, which nobody takes.
  if (target) return target.color === mover || target.role === 'king' ? undefined : target.role;
  // A pawn moving sideways onto an empty square takes en passant.
  return board.get(from)?.role === 'pawn' && from % 8 !== to % 8 ? 'pawn' : undefined;
}
