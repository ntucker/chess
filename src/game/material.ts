/**
 * Who is ahead on material, the way lichess shows it beside each player:
 * pieces that both sides have lost cancel out, so each side keeps only the
 * pieces it is up, plus a points lead for the side ahead.
 */
import type { Board } from 'chessops/board';
import { parseFen } from 'chessops/fen';

import { type Color, opposite, type Ply, type TakenRole } from './replay';

/** The roles that count, most valuable first, as pieces are listed. */
const ROLES: readonly TakenRole[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

/** The usual piece values, in pawns. */
export const VALUES: Readonly<Record<TakenRole, number>> = {
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

/** The total value of `roles`, in pawns. */
export const pointsOf = (roles: readonly TakenRole[]) =>
  roles.reduce((sum, role) => sum + VALUES[role], 0);

/** How many points `color` is ahead on `board`; negative when behind. */
export function balance(board: Board, color: Color): number {
  return points(board, color) - points(board, opposite(color));
}

interface Material {
  /** The other side's pieces this side is up, most valuable first. */
  readonly pieces: readonly TakenRole[];
  /** This side's lead in points; 0 unless it is ahead. */
  readonly lead: number;
}

/**
 * Each side's material edge in the position `fen`. A promoted pawn counts as
 * the piece it became, so a queening shows as a queen up and a pawn down.
 */
export function material(fen: string): Readonly<Record<Color, Material>> {
  const { board } = parseFen(fen).unwrap();
  const up: Record<Color, TakenRole[]> = { white: [], black: [] };
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

/** What the name bars say of the pieces taken by a position in a game. */
export interface Captures {
  /** Each side's edge on the board (`material`). */
  readonly material: Readonly<Record<Color, Material>>;
  /** Everything each side has taken by then, most valuable first (`takenBy`). */
  readonly taken: Taken;
}

/** The captures by `plies[ply]`, the position after `ply` moves of the game `plies`. */
export function captures(plies: readonly Ply[], ply: number): Captures {
  return { material: material(plies[ply].fen), taken: takenBy(plies.slice(0, ply + 1)) };
}

type Taken = Readonly<Record<Color, readonly TakenRole[]>>;

/**
 * The pieces each side took over `plies`, each as it stood when taken: a
 * promoted pawn taken counts as the piece it became. Read from the moves,
 * since a position can't tell: the starting set less what's left lists a
 * pawn nobody took after a promotion.
 */
export function takenBy(plies: readonly Ply[]): Taken {
  const taken: Record<Color, TakenRole[]> = { white: [], black: [] };
  for (const { move, turn } of plies) {
    // `turn` is who moves next, so the taker is the other side.
    if (move?.captured) taken[opposite(turn)].push(move.captured);
  }
  const byValue = (a: TakenRole, b: TakenRole) => ROLES.indexOf(a) - ROLES.indexOf(b);
  return { white: taken.white.sort(byValue), black: taken.black.sort(byValue) };
}
