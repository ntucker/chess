import { describe, expect, it } from '@jest/globals';

import { splitPieceLetters } from './notation';

describe('splitPieceLetters', () => {
  it("cuts out a move's piece letter", () => {
    expect(splitPieceLetters('Qb6')).toEqual(['', 'Q', 'b6']);
    expect(splitPieceLetters('23…Qb6')).toEqual(['23…', 'Q', 'b6']);
    expect(splitPieceLetters('Nbd7')).toEqual(['', 'N', 'bd7']);
    expect(splitPieceLetters('R1e2')).toEqual(['', 'R', '1e2']);
    expect(splitPieceLetters('Qh4xe1+')).toEqual(['', 'Q', 'h4xe1+']);
  });

  it("cuts out a promotion's piece", () => {
    expect(splitPieceLetters('exd8=Q+')).toEqual(['exd8=', 'Q', '+']);
    expect(splitPieceLetters('b1=N')).toEqual(['b1=', 'N', '']);
  });

  it('leaves pawn moves and castling whole', () => {
    expect(splitPieceLetters('exd5')).toEqual(['exd5']);
    expect(splitPieceLetters('O-O-O')).toEqual(['O-O-O']);
  });

  it('finds every move in a sentence and leaves its words alone', () => {
    expect(splitPieceLetters('Found with Nf3, on try 2.')).toEqual([
      'Found with ',
      'N',
      'f3, on try 2.',
    ]);
    expect(splitPieceLetters('Bayonet Attack: after 9.Ne1 Nd7, Black Queens up')).toEqual([
      'Bayonet Attack: after 9.',
      'N',
      'e1 ',
      'N',
      'd7, Black Queens up',
    ]);
    expect(splitPieceLetters('KQRBN and Ka')).toEqual(['KQRBN and Ka']);
    expect(splitPieceLetters('a =Q, a Nf3-file, ANf3')).toEqual(['a =Q, a Nf3-file, ANf3']);
  });
});
