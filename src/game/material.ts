/**
 * Who is ahead on material, the way lichess shows it beside each player:
 * pieces that both sides have lost cancel out, so each side keeps only the
 * pieces it is up, plus a points lead for the side ahead.
 */
import { parseFen } from 'chessops/fen';
import type { Role } from 'chessops/types';

import type { Color } from './replay';

/** The roles that count. */
export type MaterialRole = Exclude<Role, 'king'>;

/** The usual piece values, in pawns, most valuable first, as pieces are listed. */
const VALUES: Readonly<Record<MaterialRole, number>> = {
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};
const ROLES = Object.keys(VALUES) as MaterialRole[];

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
  let score = 0;
  for (const role of ROLES) {
    const diff = board.pieces('white', role).size() - board.pieces('black', role).size();
    score += diff * VALUES[role];
    for (let i = 0; i < Math.abs(diff); i++) up[diff > 0 ? 'white' : 'black'].push(role);
  }
  return {
    white: { pieces: up.white, lead: Math.max(0, score) },
    black: { pieces: up.black, lead: Math.max(0, -score) },
  };
}
