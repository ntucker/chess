import { describe, expect, it } from '@jest/globals';
import { INITIAL_FEN } from 'chessops/fen';

import { LESSON_FORMAT, type Lesson, type LessonMove, type Note } from '@/lesson/lesson';
import { keyAfter, SAMPLE } from '@/lesson/lesson.fixture';

import { at, uci } from './fixture';
import { noteTranspositions } from './transpositions';

const SEMI_SLAV: Note = { text: 'You strengthen d5.' };
const semiSlav = keyAfter('d4', 'd5', 'c4', 'c6', 'Nc3', 'e6');
const otherOrder = keyAfter('d4', 'd5', 'c4', 'e6', 'Nc3');

/**
 * Black's lesson: 1.d4 d5 2.c4 c6 3.Nc3 e6 (book), with 2...e6 3.Nc3 c6 shown
 * but not played: the same position by the other move order, explained there.
 */
function lesson({ bookNote, positionNote }: { bookNote?: Note; positionNote?: Note } = {}): Lesson {
  return {
    format: LESSON_FORMAT,
    id: 'test',
    title: 'Test',
    side: 'black',
    start: INITIAL_FEN,
    sources: SAMPLE.sources,
    variations: { test: { name: 'Test' } },
    positions: {
      [keyAfter()]: at([{ uci: uci('d4') }]),
      [keyAfter('d4')]: at([{ uci: uci('d4', 'd5'), book: true }]),
      [keyAfter('d4', 'd5')]: at([{ uci: uci('d4', 'd5', 'c4') }]),
      [keyAfter('d4', 'd5', 'c4')]: at([
        { uci: uci('d4', 'd5', 'c4', 'c6'), book: true },
        { uci: uci('d4', 'd5', 'c4', 'e6') },
      ]),
      [keyAfter('d4', 'd5', 'c4', 'c6')]: at([{ uci: uci('d4', 'd5', 'c4', 'c6', 'Nc3') }]),
      [keyAfter('d4', 'd5', 'c4', 'c6', 'Nc3')]: at([
        {
          uci: uci('d4', 'd5', 'c4', 'c6', 'Nc3', 'e6'),
          book: true,
          ...(bookNote && { notes: [bookNote] }),
        },
      ]),
      [keyAfter('d4', 'd5', 'c4', 'e6')]: at([{ uci: uci('d4', 'd5', 'c4', 'e6', 'Nc3') }]),
      [keyAfter('d4', 'd5', 'c4', 'e6', 'Nc3')]: at([
        { uci: uci('d4', 'd5', 'c4', 'e6', 'Nc3', 'c6'), book: true, notes: [SEMI_SLAV] },
      ]),
      [semiSlav]: at(
        [{ uci: uci('d4', 'd5', 'c4', 'c6', 'Nc3', 'e6', 'Nf3') }],
        positionNote && [positionNote],
      ),
    },
  };
}

describe('noteTranspositions', () => {
  it("gives a move order's notes to the position the learner reaches by another", () => {
    const { lesson: moved, moved: count } = noteTranspositions(lesson());
    expect(count).toBe(1);
    expect(moved.positions[semiSlav].notes).toEqual([SEMI_SLAV]);
    expect(moved.positions[otherOrder].moves[0]).toEqual({
      uci: uci('d4', 'd5', 'c4', 'e6', 'Nc3', 'c6'),
      book: true,
    });
  });

  it('leaves them where the move the learner plays is explained', () => {
    const input = lesson({ bookNote: { text: 'The Semi-Slav.' } });
    expect(noteTranspositions(input)).toEqual({ lesson: input, moved: 0 });
  });

  it('leaves them where the position has notes of its own', () => {
    const input = lesson({ positionNote: { text: 'The Semi-Slav.' } });
    expect(noteTranspositions(input)).toEqual({ lesson: input, moved: 0 });
  });

  it('leaves them on a move the learner could play but the book rejects', () => {
    const input = lesson();
    // The learner reaches 2...e6 3.Nc3 too, where the book prefers 3...Nf6 to 3...c6.
    const positions = {
      ...input.positions,
      [keyAfter('d4', 'd5', 'c4')]: at([
        { uci: uci('d4', 'd5', 'c4', 'c6'), book: true },
        { uci: uci('d4', 'd5', 'c4', 'e6'), book: true },
      ]),
      [otherOrder]: at([
        { uci: uci('d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'), book: true },
        { uci: uci('d4', 'd5', 'c4', 'e6', 'Nc3', 'c6'), notes: [SEMI_SLAV] },
      ]),
    };
    const rejected = { ...input, positions };
    expect(noteTranspositions(rejected)).toEqual({ lesson: rejected, moved: 0 });
  });

  it('leaves them where the learner never reaches the position', () => {
    const input = lesson();
    const key = keyAfter('d4', 'd5', 'c4', 'c6', 'Nc3');
    // Without the book move into it, only the other move order reaches the Semi-Slav.
    const positions = {
      ...input.positions,
      [key]: at([{ uci: uci('d4', 'd5', 'c4', 'c6', 'Nc3', 'Nf6'), book: true }]),
    };
    const unreached = { ...input, positions };
    expect(noteTranspositions(unreached)).toEqual({ lesson: unreached, moved: 0 });
  });
});
