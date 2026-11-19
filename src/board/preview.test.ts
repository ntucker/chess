import { describe, expect, it } from '@jest/globals';
import { parseFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';

import type { Square } from './drawing';
import { type Pieces, previewLayer } from './preview';

/** The pieces of a FEN's board. */
function pieces(fen: string): Pieces {
  const { board } = parseFen(fen).unwrap();
  return new Map(
    [...board].map(([square, { role, color }]) => [makeSquare(square) as Square, { role, color }]),
  );
}

const layer = (game: string, preview: string) => previewLayer(pieces(game), pieces(preview));
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

describe('previewLayer', () => {
  it('draws nothing over a position like the game', () => {
    expect(layer(AFTER_E4, AFTER_E4)).toEqual({ pieces: [], away: new Set(), taken: new Set() });
  });

  it('slides the moved piece from where it stood, leaving a ghost there', () => {
    const c6 = 'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    expect(layer(AFTER_E4, c6)).toEqual({
      pieces: [{ square: 'c6', from: 'c7', piece: { role: 'pawn', color: 'black' } }],
      away: new Set(['c7']),
      taken: new Set(),
    });
  });

  it('hides a captured piece, also taken en passant', () => {
    const before = 'rnbqkbnr/ppp2ppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
    const exd6 = 'rnbqkbnr/ppp2ppp/3P4/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3';
    expect(layer(before, exd6)).toMatchObject({
      pieces: [{ square: 'd6', from: 'e5' }],
      away: new Set(['e5']),
      taken: new Set(['d5']),
    });
  });

  it('slides both the king and the rook when castling', () => {
    const before = 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4';
    const castled = 'r1bqk2r/ppppbppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4';
    const { pieces: shown, away } = layer(before, castled);
    expect(shown.map(({ from, square }) => [from, square])).toEqual(
      expect.arrayContaining([
        ['e1', 'g1'],
        ['h1', 'f1'],
      ]),
    );
    expect(away).toEqual(new Set(['e1', 'h1']));
  });

  it("slides a promoted piece from its pawn's square, over the piece it takes", () => {
    const before = 'r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1';
    const bxa8 = 'Q3k3/8/8/8/8/8/8/4K3 b - - 0 1';
    expect(layer(before, bxa8)).toEqual({
      pieces: [{ square: 'a8', from: 'b7', piece: { role: 'queen', color: 'white' } }],
      away: new Set(['b7']),
      taken: new Set(['a8']),
    });
  });
});
