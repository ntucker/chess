import { describe, expect, it } from '@jest/globals';

import { INITIAL_FEN } from 'chessops/fen';

import { material, takenBy } from './material';
import { lastPosition, parsePosition, replay } from './replay';

const even = { pieces: [], lead: 0 };

describe('material', () => {
  it('is even at the start', () => {
    expect(material(INITIAL_FEN)).toEqual({ white: even, black: even });
  });

  it('gives the capturing side the piece and the lead', () => {
    // 1. e4 d5 2. exd5: White is a pawn up.
    const { fen } = lastPosition(['e2e4', 'd7d5', 'e4d5']);
    expect(material(fen)).toEqual({ white: { pieces: ['pawn'], lead: 1 }, black: even });
  });

  it('cancels out pieces both sides have lost', () => {
    // 1. e4 d5 2. exd5 Qxd5: a pawn each.
    const { fen } = lastPosition(['e2e4', 'd7d5', 'e4d5', 'd8d5']);
    expect(material(fen)).toEqual({ white: even, black: even });
  });

  it('lists pieces on both sides but the lead only for the side ahead', () => {
    // White has won a rook for three pawns, most valuable first.
    const fen = '1nbqkbnr/pppppppp/8/8/8/8/PPPPP3/RNBQKBNR w KQk - 0 1';
    expect(material(fen)).toEqual({
      white: { pieces: ['rook'], lead: 2 },
      black: { pieces: ['pawn', 'pawn', 'pawn'], lead: 0 },
    });
  });

  it('gives Black the lead when Black is ahead', () => {
    // Black has won a rook for a pawn.
    const fen = 'rnbqkbnr/ppppppp1/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1';
    expect(material(fen)).toEqual({
      white: { pieces: ['pawn'], lead: 0 },
      black: { pieces: ['rook'], lead: 4 },
    });
  });

  it('counts a promoted pawn as its new piece', () => {
    // White has queened its h-pawn: a queen up, a pawn down, eight points ahead.
    const fen = 'rnbqkbnr/pppppppp/8/8/3Q4/8/PPPPPPP1/RNBQKBNR w KQkq - 0 1';
    expect(material(fen)).toEqual({
      white: { pieces: ['queen'], lead: 8 },
      black: { pieces: ['pawn'], lead: 0 },
    });
  });
});

describe('takenBy', () => {
  const taken = (line: readonly string[]) => takenBy(replay(line));

  it('lists nothing before a capture', () => {
    expect(taken(['e2e4', 'e7e5'])).toEqual({ white: [], black: [] });
  });

  it('lists what each side took, most valuable first', () => {
    // 1. e4 d5 2. exd5 Qxd5 3. Nc3 Qxa2 4. Rxa2: each a pawn, then Black a pawn and White the queen.
    expect(taken(['e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5a2', 'a1a2'])).toEqual({
      white: ['queen', 'pawn'],
      black: ['pawn', 'pawn'],
    });
  });

  it('counts a pawn taken en passant', () => {
    // 1. e4 a6 2. e5 d5 3. exd6 e.p.
    expect(taken(['e2e4', 'a7a6', 'e4e5', 'd7d5', 'e5d6'])).toEqual({
      white: ['pawn'],
      black: [],
    });
  });

  it('counts a promoted pawn taken as the piece it became', () => {
    // White's b-pawn takes the a8 rook and queens; Black's other rook takes the queen.
    const start = parsePosition('r3k3/1P6/8/8/8/8/7K/r7 w - - 0 1')!;
    expect(takenBy(replay(['b7a8q', 'a1a8'], start))).toEqual({
      white: ['rook'],
      black: ['queen'],
    });
  });

  it("doesn't count castling as taking the mover's rook", () => {
    const start = parsePosition('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')!;
    expect(takenBy(replay(['e1h1'], start))).toEqual({ white: [], black: [] });
  });
});
