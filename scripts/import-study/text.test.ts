import { describe, expect, it } from '@jest/globals';

import { namedMoves, shorten, textVerdicts } from './text';

describe('namedMoves', () => {
  it('reads numbered and bare moves, continuing the count', () => {
    expect(namedMoves('Trap: 9...Qa5+? 10.Nc3 e6 and Black is losing.')).toEqual([
      { san: 'Qa5', ply: 18, side: 'black' },
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
});

describe('shorten', () => {
  it('keeps a short first sentence', () => {
    expect(shorten('White grabs space. Then plays c3.')).toBe('White grabs space.');
  });

  it('reads past move numbers and glyphs on moves', () => {
    expect(shorten('Trap: 5.e6? fxe6 and White is worse. Then more.')).toBe('Trap: 5.e6? fxe6 and White is worse.');
    expect(shorten('After 4. Nf3 Black plays ...e6! with ease. Next.')).toBe(
      'After 4. Nf3 Black plays ...e6! with ease.',
    );
    expect(shorten('Trap: 15...bxc6? Nxc6 wins. More.')).toBe('Trap: 15...bxc6? Nxc6 wins.');
  });

  it('ends a sentence at a number or a move that ends it', () => {
    expect(shorten('The knight is lost on move 12. Black resigns.')).toBe('The knight is lost on move 12.');
    expect(shorten('Black should play Nf6! Then White is stuck.')).toBe('Black should play Nf6!');
    expect(shorten('...Nc6! Black plans ...Nb4. More.')).toBe('...Nc6! Black plans ...Nb4.');
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
