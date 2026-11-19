// What the board draws for a previewed position: the pieces that differ from
// the game's, drawn over it, while the game's own board stays as it is, so
// presses and drags always reach the game. Pure, so it's tested without a DOM;
// imports only types, since the board runs in a web view on Android.
import type { BoardPiece, Square } from '@/board/drawing';

/** The pieces of a position by square. */
export type Pieces = ReadonlyMap<Square, BoardPiece>;

/** A piece of the previewed position drawn over the game's board. */
export interface PreviewPiece {
  readonly square: Square;
  /** Where it slides from: the square it left, or `square` for a piece that only appears. */
  readonly from: Square;
  readonly piece: BoardPiece;
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
  const leaving = ({ color, role }: BoardPiece) =>
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
 * Whether moving the piece on `from` to `to` plays the move `layer` previews,
 * whose pieces are already drawn where it lands. Example: with 1...c6
 * previewed, c7 to c6 does; c7 to c5 doesn't.
 */
export const playsPreview = (layer: PreviewLayer, from: Square, to: Square) =>
  layer.pieces.some((piece) => piece.from === from && piece.square === to);

/** Whether two FENs place the same pieces, whatever their other fields. */
export const samePlacement = (a: string, b: string) => a.split(' ')[0] === b.split(' ')[0];
