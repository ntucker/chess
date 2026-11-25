import { describe, expect, it } from '@jest/globals';

import { playMove, positionKey, readPositionKey } from '@/game/replay';

import type { Lesson, PositionKey } from './lesson';
import { SAMPLE, uciLine } from './lesson.fixture';
import { noteParts } from './mentions';
import type { BoardNote } from './mistakes';
import { lineKeys } from './select';

/** The key after `sans` from the start. */
const keyAfter = (...sans: string[]) => lineKeys(uciLine(...sans)).at(-1)!;

const note = (text: string, extra: Partial<BoardNote> = {}): BoardNote => ({ text, ...extra });

/** A lesson with no guide, so only the note and its ideas place a move. */
const bare = { positions: {} } as unknown as Lesson;

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

  it('shows a move where the note’s own trap plays it, over the position its move was played in', () => {
    // On 5.Qe2: Nd6 is legal before Qe2 too, but mates only after the trap's ...Ngf6.
    const before = 'r1bqkbnr/pp1npppp/2p5/8/3PN3/8/PPP2PPP/R1BQKBNR w KQkq -' as PositionKey;
    const after = 'r1bqkbnr/pp1npppp/2p5/8/3PN3/8/PPP1QPPP/R1B1KBNR b KQkq -' as PositionKey;
    const trap = note('Don’t play ...Ngf6, because Nd6 is mate.', {
      ideas: [
        { type: 'trap', moves: ['g8f6', 'e4d6'], verdict: 'losesMaterial', learnerFalls: true },
      ],
    });
    const [, , , mate] = noteParts(bare, {
      note: trap,
      after,
      before,
    });
    expect(mate).toEqual({
      text: 'Nd6',
      key: 'r1bqkb1r/pp1npppp/2pN1n2/8/3P4/8/PPP1QPPP/R1B1KBNR b KQkq -',
      lit: ['e4', 'd6'],
      kind: 'move',
    });
  });

  it('reads a line’s position only as the move the line plays there', () => {
    // ...Nc6 is legal after 1.e4 too, but the line plays it after 2.Nc3.
    const line = note('Then ...Nc6.', {
      ideas: [{ type: 'line', moves: ['e2e4', 'g8f6', 'b1c3', 'b8c6'], verdict: 'equal' }],
    });
    const [, mention] = noteParts(bare, {
      note: line,
      after: keyAfter(),
    });
    expect(mention).toMatchObject({ key: keyAfter('e4', 'Nf6', 'Nc3', 'Nc6'), lit: ['b8', 'c6'] });
  });

  it('shows a move only the side not to move can play now, played from there', () => {
    // The Caro-Kann note on ...e5, White to move: Black's ...Be7 answers Bg5 later.
    const before = 'r1bqkb1r/pp2pppp/2n2n2/3p4/8/1B1P1N2/PPP2PPP/RNBQK2R b KQkq -' as PositionKey;
    const pos = readPositionKey(before)!;
    playMove(pos, 'e7e5');
    const parts = noteParts(bare, {
      note: note('You still play ...e5 and answer Bg5 with ...Be7.'),
      after: positionKey(pos),
      before,
    });
    expect(parts.at(-2)).toMatchObject({ text: '...Be7', lit: ['f8', 'e7'], kind: 'move' });
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
    it('when no position within reach has it', () => {
      const after = '4r1k1/5ppp/8/8/8/8/5PPP/R5K1 w - -' as PositionKey;
      expect(noteParts(bare, { note: note('Not Qh5 here.'), after })).toEqual(['Not Qh5 here.']);
      // Only White's rook reaches d1, so the note means it.
      expect(noteParts(bare, { note: note('Watch Rd1.'), after })[1]).toMatchObject({
        lit: ['a1', 'd1'],
      });
    });

    it('when the nearest positions read it as different moves', () => {
      // White's rook can reach d1, and so can Black's when it threatens to.
      const after = '3r2k1/5ppp/8/8/8/8/5PPP/R5K1 w - -' as PositionKey;
      const threat = note('Watch Rd1.', {
        ideas: [{ type: 'threat', side: 'black', move: 'd8d1' }],
      });
      expect(noteParts(bare, { note: threat, after })).toEqual(['Watch Rd1.']);
    });

    it('when the side not to move could make it too, as notes name either side’s moves', () => {
      // Black's knight on d5 can go to c3, but the note may mean White's Nc3.
      const after = 'rnbqkb1r/pppppppp/8/3n4/8/8/PPPPPPPP/RNBQKBNR b KQkq -' as PositionKey;
      expect(noteParts(bare, { note: note('Nc3 controls d5.'), after })[0]).toBe('Nc3 controls ');
    });

    it('when the side not to move reads it as a different move than a later position does', () => {
      // White can't play Nc3 here, Black's knight can, and White's could before e4.
      const after = 'rnbqkb1r/pppppppp/8/3n4/4P3/8/PPPP1PPP/R1BQKBNR w KQkq -' as PositionKey;
      const before = 'rnbqkb1r/pppppppp/8/3n4/8/8/PPPPPPPP/RNBQKBNR w KQkq -' as PositionKey;
      expect(noteParts(bare, { note: note('Nc3 controls d5.'), after, before })[0]).toBe(
        'Nc3 controls ',
      );
    });

    it('when the only reading takes a piece the SAN doesn’t say it takes', () => {
      // A recap: White's queen already stands on e3, and only Black's could go there, taking it.
      const after = 'r1b1k2r/p3b1pp/2p2p2/1pn1p3/3qP2N/1B2Q3/PPP2PPP/R1B2RK1 w kq -' as PositionKey;
      expect(noteParts(bare, { note: note('Qe3 is the cautious choice.'), after })[0]).toBe(
        'Qe3 is the cautious choice.',
      );
    });
  });

  it('keeps a capture plain where the square it takes on stands empty', () => {
    // White's knight can go to e5, but takes nothing there.
    const after = keyAfter('e4', 'd5', 'Nf3');
    expect(noteParts(bare, { note: note('Nxe5 comes later.'), after })[0]).toBe(
      'Nxe5 comes later.',
    );
  });

  it('reads past a position where the SAN would take a piece it doesn’t say it takes', () => {
    // On its own move's note, "Qb6" isn't White's queen taking on b6 after it.
    const before =
      'rn1qkb1r/pp3ppp/2p1pn2/3p1b2/2PP1B2/1QN1P3/PP3PPP/R3KBNR b KQkq -' as PositionKey;
    const pos = readPositionKey(before)!;
    playMove(pos, 'd8b6');
    const after = positionKey(pos);
    const parts = noteParts(bare, { note: note('Qb6 is the usual move.'), after, before });
    expect(parts[0]).toEqual({ text: 'Qb6', key: after, lit: ['d8', 'b6'], kind: 'move' });
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
