import { describe, expect, it } from '@jest/globals';

import type { Lesson, Note, PositionKey } from './lesson';
import { SAMPLE, uciLine } from './lesson.fixture';
import { noteParts } from './mentions';
import { lineKeys } from './select';

/** The key after `sans` from the start. */
const keyAfter = (...sans: string[]) => lineKeys(uciLine(...sans)).at(-1)!;

const note = (text: string, extra: Partial<Note> = {}): Note => ({ text, ...extra });

describe('noteParts', () => {
  it('leaves a note naming nothing as its words', () => {
    const after = keyAfter('e4');
    expect(noteParts(SAMPLE, { note: note('A solid answer.'), after })).toEqual([
      'A solid answer.',
    ]);
  });

  it('shows a square lit in the note’s position, even where a pawn could move to it', () => {
    const after = keyAfter('e4', 'c6', 'd4', 'd5', 'e5');
    const parts = noteParts(SAMPLE, {
      note: note('Strike at the base of the chain, d4.'),
      after,
    });
    expect(parts).toEqual([
      'Strike at the base of the chain, ',
      { text: 'd4', key: after, lit: ['d4'], kind: 'square' },
      '.',
    ]);
  });

  it('shows a move played from the position the note’s move was played in', () => {
    // The note on 3.Nd2 names the move White could have played instead.
    const before = keyAfter('e4', 'c6', 'd4', 'd5');
    const parts = noteParts(SAMPLE, {
      note: note('Same idea as Nc3, keeping the c-pawn free.'),
      after: keyAfter('e4', 'c6', 'd4', 'd5', 'Nd2'),
      before,
    });
    expect(parts[1]).toEqual({
      text: 'Nc3',
      key: keyAfter('e4', 'c6', 'd4', 'd5', 'Nc3'),
      lit: ['b1', 'c3'],
      kind: 'move',
    });
  });

  it('looks a ply on along the guide for a move not legal yet, and reads dots as Black’s', () => {
    const after = keyAfter('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5');
    const parts = noteParts(SAMPLE, { note: note('White answers Nc3, then ...e6.'), after });
    expect(parts).toEqual([
      'White answers ',
      {
        text: 'Nc3',
        key: keyAfter('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nc3'),
        lit: ['b1', 'c3'],
        kind: 'move',
      },
      ', then ',
      // After 4.Nf3 and after 4.Nc3 alike: the same move, shown after the guide's first.
      {
        text: '...e6',
        key: keyAfter('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6'),
        lit: ['e7', 'e6'],
        kind: 'move',
      },
      '.',
    ]);
  });

  it('shows a route written square to square as its move', () => {
    const after = keyAfter('e4', 'c6', 'd4', 'd5', 'e5');
    const [, mention] = noteParts(SAMPLE, { note: note('Then c6-c5 hits d4.'), after });
    expect(mention).toEqual({
      text: 'c6-c5',
      key: keyAfter('e4', 'c6', 'd4', 'd5', 'e5', 'c5'),
      lit: ['c6', 'c5'],
      kind: 'move',
    });
  });

  describe('leaves a move it can’t place as words', () => {
    // White's rook can reach d1, and so can Black's when it threatens.
    const after = '3r2k1/5ppp/8/8/8/8/5PPP/R5K1 w - -' as PositionKey;
    const bare = { positions: {} } as unknown as Lesson;

    it('when no position within reach has it', () => {
      expect(noteParts(bare, { note: note('Not Qh5 here.'), after })).toEqual(['Not Qh5 here.']);
    });

    it('when the nearest positions read it as different moves', () => {
      expect(noteParts(bare, { note: note('Watch Rd1.'), after })[1]).toMatchObject({
        lit: ['a1', 'd1'],
      });
      const threat = note('Watch Rd1.', {
        ideas: [{ type: 'threat', side: 'black', move: 'd8d1' }],
      });
      expect(noteParts(bare, { note: threat, after })).toEqual(['Watch Rd1.']);
    });
  });

  it('keeps a diagonal’s name as words, and a numbered move’s number in its mention', () => {
    const after = keyAfter('e4');
    const parts = noteParts(SAMPLE, { note: note('The b1-h7 diagonal; 1...c6 next.'), after });
    expect(parts).toEqual([
      'The b1-h7 diagonal; ',
      { text: '1...c6', key: keyAfter('e4', 'c6'), lit: ['c7', 'c6'], kind: 'move' },
      ' next.',
    ]);
  });
});
