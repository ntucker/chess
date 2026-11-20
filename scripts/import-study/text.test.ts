import { describe, expect, it } from '@jest/globals';

import { parsePosition, sanToUci } from '@/game/replay';

import { moveInWords, namedMoves, shorten, sideDoes, textVerdicts } from './text';

describe('namedMoves', () => {
  it('reads numbered and bare moves, continuing the count', () => {
    expect(namedMoves('Trap: 9...Qa5+? 10.Nc3 e6 and Black is losing.')).toEqual([
      { san: 'Qa5', ply: 18, side: 'black', glyph: '?' },
      { san: 'Nc3', ply: 19, side: 'white' },
      { san: 'e6', ply: 20, side: 'black' },
    ]);
  });

  it('reads ... as a black move with no number', () => {
    expect(namedMoves('play ...Nd7 and ...O-O')).toEqual([
      { san: 'Nd7', side: 'black' },
      { san: 'O-O', side: 'black' },
    ]);
  });

  it('reads ... written right after a move', () => {
    expect(namedMoves('Qxd4...Qxd4 Nc3')).toEqual([
      { san: 'Qxd4' },
      { san: 'Qxd4', side: 'black' },
      { san: 'Nc3', side: 'white' },
    ]);
  });
});

describe('shorten', () => {
  it('keeps a short first sentence', () => {
    expect(shorten('White grabs space. Then plays c3.')).toBe('White grabs space.');
  });

  it('reads past move numbers and glyphs on moves', () => {
    expect(shorten('Trap: 5.e6? fxe6 and White is worse. Then more.')).toBe(
      'Trap: 5.e6? fxe6 and White is worse.',
    );
    expect(shorten('After 4. Nf3 Black plays ...e6! with ease. Next.')).toBe(
      'After 4. Nf3 Black plays ...e6! with ease.',
    );
    expect(shorten('Trap: 15...bxc6? Nxc6 wins. More.')).toBe('Trap: 15...bxc6? Nxc6 wins.');
  });

  it('ends a sentence at a number or a move that ends it', () => {
    expect(shorten('The knight is lost on move 12. Black resigns.')).toBe(
      'The knight is lost on move 12.',
    );
    expect(shorten('Black should play Nf6! Then White is stuck.')).toBe('Black should play Nf6!');
    expect(shorten('...Nc6! Black plans ...Nb4. More.')).toBe('...Nc6! Black plans ...Nb4.');
    expect(shorten('12. Nf3! Black is lost. More.')).toBe('12. Nf3! Black is lost.');
    expect(shorten('Nf3! Nf6! Black is lost. More.')).toBe('Nf3! Nf6! Black is lost.');
  });

  it('cuts a long sentence at the word limit', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    expect(shorten(long).split(' ')).toHaveLength(20);
    expect(shorten(long).endsWith('w19…')).toBe(true);
  });
});

describe('textVerdicts', () => {
  it.each([
    ['White keeps a small edge.', ['white']],
    ['You are slightly worse here.', ['white']],
    ['Black is a bit better.', ['black']],
    ['The position is level.', ['equal']],
    ['White is not better after this.', []],
  ])('%s', (text, directions) => {
    expect([...textVerdicts(text, 'black')]).toEqual(directions);
  });
});

describe('sideDoes', () => {
  it('names the other side, and speaks to the learner as "you"', () => {
    expect(sideDoes('white', 'black', 'is losing')).toBe('White is losing');
    expect(sideDoes('black', 'black', 'is in big trouble')).toBe('you are in big trouble');
    expect(sideDoes('black', 'black', 'gets mated')).toBe('you get mated');
    expect(sideDoes('black', 'black', 'drops a piece')).toBe('you drop a piece');
  });
});

describe('moveInWords', () => {
  const words = (fen: string, san: string) => {
    const pos = parsePosition(fen)!;
    return moveInWords(pos, sanToUci(pos, san)!);
  };

  it('says a move without notation, naming its square', () => {
    expect(words('4k3/8/8/8/3p4/5N2/8/4K3 w - - 0 1', 'Nxd4')).toBe('Taking on d4 with the knight');
    expect(words('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'exd5')).toBe('Taking on d5 with the pawn');
    expect(words('3qk3/8/8/8/8/8/8/4K3 b - - 0 1', 'Qa5+')).toBe('Checking with the queen on a5');
    expect(words('1n2k3/8/5n2/8/8/8/8/4K3 b - - 0 1', 'Nbd7')).toBe('Moving the knight to d7');
    expect(words('4k3/7p/8/8/8/8/8/4K3 b - - 0 1', 'h6')).toBe('Pushing the pawn to h6');
    expect(words('r3k3/8/8/8/8/8/8/4K3 b q - 0 1', 'O-O-O')).toBe('Castling long');
  });

  it('says check, mate and promotion', () => {
    expect(words('4k3/5p2/8/8/2B5/8/8/4K3 w - - 0 1', 'Bxf7+')).toBe(
      'Taking on f7 with the bishop, giving check',
    );
    expect(words('4r1k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1', 'Rxe1#')).toBe(
      'Taking on e1 with the rook, giving mate',
    );
    expect(words('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2', 'Qh4#')).toBe(
      'Mating with the queen on h4',
    );
    expect(words('5k2/8/8/8/8/8/8/4K2R w K - 0 1', 'O-O+')).toBe('Castling short, giving check');
    expect(words('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', 'e8=Q')).toBe(
      'Pushing the pawn to e8 and promoting to a queen',
    );
    expect(words('3r4/4Pk2/8/8/8/8/8/4K3 w - - 0 1', 'exd8=N+')).toBe(
      'Taking on d8 with the pawn and promoting to a knight, giving check',
    );
  });
});
