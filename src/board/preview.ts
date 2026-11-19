// What the board draws for a previewed position: the pieces that differ from
// the game's, drawn over it, while the game's own board stays as it is, so
// presses and drags always reach the game. Pure, so it's tested without a DOM;
// imports only types, since the board runs in a web view on Android.
import type { Piece } from 'chessops/types';

import type { Square } from '@/board/drawing';
import type { Color } from '@/game/replay';

/** The pieces of a position by square. */
export type Pieces = ReadonlyMap<Square, Readonly<Pick<Piece, 'role' | 'color'>>>;

/** A piece of the previewed position drawn over the game's board. */
export interface PreviewPiece {
  readonly square: Square;
  /** Where it slides from: the square it left, or `square` for a piece that only appears. */
  readonly from: Square;
  readonly piece: Readonly<Pick<Piece, 'role' | 'color'>>;
}

/** How the game's board looks under a previewed position. */
export interface PreviewLayer {
  readonly pieces: readonly PreviewPiece[];
  /** Squares whose game piece moves away in the preview: they show as a ghost. */
  readonly away: ReadonlySet<Square>;
  /** Squares whose game piece is captured or replaced in the preview: they hide. */
  readonly taken: ReadonlySet<Square>;
}

export const NO_PREVIEW: PreviewLayer = { pieces: [], away: new Set(), taken: new Set() };

/**
 * The layer that turns the board's `game` pieces into `preview`'s. Each piece
 * that differs appears where the preview has it, sliding from the square
 * where the game had the same piece and the preview has it no longer; a
 * promotion slides from the pawn's square. Example: after 1.e4, previewing
 * 1...c6 slides a black pawn from c7 to c6 and leaves c7's pawn as a ghost.
 * Castling slides the king and the rook; a capture hides the piece taken.
 */
export function previewLayer(game: Pieces, preview: Pieces): PreviewLayer {
  const same = (square: Square) => {
    const [a, b] = [game.get(square), preview.get(square)];
    return a?.role === b?.role && a?.color === b?.color;
  };
  const left = [...game.keys()].filter((square) => !same(square));
  const arrived = [...preview.entries()].filter(([square]) => !same(square));
  const away = new Set<Square>();
  const leaving = ({ color, role }: Pick<Piece, 'role' | 'color'>) =>
    left.find(
      (at) => !away.has(at) && game.get(at)?.color === color && game.get(at)?.role === role,
    );
  const pieces = arrived.map(([square, piece]): PreviewPiece => {
    const from = leaving(piece) ?? leaving({ color: piece.color, role: 'pawn' });
    if (from) away.add(from);
    return { square, from: from ?? square, piece };
  });
  return { pieces, away, taken: new Set(left.filter((square) => !away.has(square))) };
}

/**
 * How many squares right and down `square` is from the board's top left
 * corner, as seen from `orientation`'s side. (Chessground's key2pos does
 * this, but chessground ships only ES modules, which Jest can't load.)
 */
export function squareOffset(square: Square, orientation: Color): readonly [number, number] {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  return orientation === 'white' ? [file, 7 - rank] : [7 - file, rank];
}
