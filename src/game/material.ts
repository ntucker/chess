/**
 * Who is ahead on material, the way lichess shows it beside each player:
 * pieces that both sides have lost cancel out, so each side keeps only the
 * pieces it is up, plus a points lead for the side ahead.
 */
import { parseFen } from 'chessops/fen';
import type { Color, Role } from 'chessops/types';
import { opposite } from 'chessops/util';

/** The roles that count, most valuable first, as the pieces are listed. */
export type MaterialRole = Exclude<Role, 'king'>;
const ROLES: readonly MaterialRole[] = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

/** The usual piece values, in pawns. */
const VALUES: Readonly<Record<MaterialRole, number>> = {
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};

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
  const ahead = (color: Color): Material => {
    const pieces: MaterialRole[] = [];
    let score = 0;
    for (const role of ROLES) {
      const diff =
        board.pieces(color, role).size() - board.pieces(opposite(color), role).size();
      score += diff * VALUES[role];
      for (let i = 0; i < diff; i++) pieces.push(role);
    }
    return { pieces, lead: Math.max(0, score) };
  };
  return { white: ahead('white'), black: ahead('black') };
}
