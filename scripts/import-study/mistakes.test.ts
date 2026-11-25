import { describe, expect, it } from '@jest/globals';

import type { LessonMove } from '@/lesson/lesson';
import { keyAfter, uci } from '@/lesson/lesson.fixture';

import { at, testLesson } from './fixture';
import { markMistakes, type StudyIdea } from './mistakes';

/**
 * Black's lesson 1.e4 e5 2.Nf3, whose note on 1...e5 draws the trap 2.Ba6? bxa6,
 * with `afterBa6` the guide's moves after 2.Ba6, if it has any.
 */
const withTrap = (afterBa6?: LessonMove<StudyIdea>[]) =>
  testLesson<StudyIdea>({
    [keyAfter()]: at([{ uci: uci('e4') }]),
    [keyAfter('e4')]: at([
      {
        uci: uci('e4', 'e5'),
        book: true,
        notes: [
          {
            text: 'If 2.Ba6?, bxa6 wins the bishop.',
            ideas: [
              {
                type: 'trap',
                moves: [uci('e4', 'e5', 'Ba6'), uci('e4', 'e5', 'Ba6', 'bxa6')],
                verdict: 'losesMaterial',
              },
            ],
          },
        ],
      },
    ]),
    [keyAfter('e4', 'e5')]: at([{ uci: uci('e4', 'e5', 'Nf3') }]),
    ...(afterBa6 && { [keyAfter('e4', 'e5', 'Ba6')]: at(afterBa6) }),
  });

const movesAfterBa6 = (afterBa6?: LessonMove<StudyIdea>[]) =>
  markMistakes(withTrap(afterBa6)).lesson.positions[keyAfter('e4', 'e5', 'Ba6')].moves;

describe('markMistakes', () => {
  it("marks a trap's first move, and points its note at the mark", () => {
    const { lesson, traps } = markMistakes(withTrap());
    expect(lesson.positions[keyAfter('e4', 'e5')].moves).toEqual([
      { uci: uci('e4', 'e5', 'Nf3') },
      {
        uci: uci('e4', 'e5', 'Ba6'),
        mistake: { verdict: 'losesMaterial', line: [uci('e4', 'e5', 'Ba6', 'bxa6')] },
      },
    ]);
    expect(lesson.positions[keyAfter('e4')].moves[0].notes).toEqual([
      {
        text: 'If 2.Ba6?, bxa6 wins the bishop.',
        ideas: [{ type: 'mistake', move: uci('e4', 'e5', 'Ba6') }],
      },
    ]);
    expect(traps).toHaveLength(1);
  });

  it("writes the learner's punishing move as a book move", () => {
    expect(movesAfterBa6()).toEqual([{ uci: uci('e4', 'e5', 'Ba6', 'bxa6'), book: true }]);
  });

  it('books the punishing move where the guide has it beside other moves, none of them book', () => {
    expect(
      movesAfterBa6([
        { uci: uci('e4', 'e5', 'Ba6', 'Nxa6') },
        { uci: uci('e4', 'e5', 'Ba6', 'bxa6') },
      ]),
    ).toEqual([
      { uci: uci('e4', 'e5', 'Ba6', 'Nxa6') },
      { uci: uci('e4', 'e5', 'Ba6', 'bxa6'), book: true },
    ]);
    expect(movesAfterBa6([{ uci: uci('e4', 'e5', 'Ba6', 'Nxa6') }])).toEqual([
      { uci: uci('e4', 'e5', 'Ba6', 'Nxa6') },
      { uci: uci('e4', 'e5', 'Ba6', 'bxa6'), book: true },
    ]);
  });

  it('adds the punishing move as an ordinary one where the guide books another', () => {
    const guide = [{ uci: uci('e4', 'e5', 'Ba6', 'Nxa6'), book: true }];
    expect(movesAfterBa6(guide)).toEqual([...guide, { uci: uci('e4', 'e5', 'Ba6', 'bxa6') }]);
  });

  it("writes no moves for a trap whose mark it isn't keeping, and drops the note naming it", () => {
    const lesson = withTrap();
    const { lesson: marked, traps } = markMistakes(lesson, new Set());
    expect(marked.positions).toEqual({
      ...lesson.positions,
      [keyAfter('e4')]: at([{ uci: uci('e4', 'e5'), book: true }]),
    });
    expect(traps).toHaveLength(1);
  });

  it('writes the moves of only the first of two traps with one first move', () => {
    const lesson = withTrap();
    const note = lesson.positions[keyAfter('e4')].moves[0].notes![0];
    const second: StudyIdea = {
      type: 'trap',
      moves: [uci('e4', 'e5', 'Ba6'), uci('e4', 'e5', 'Ba6', 'Nxa6')],
      verdict: 'losesMaterial',
    };
    const twice = testLesson<StudyIdea>({
      ...lesson.positions,
      [keyAfter('e4')]: at([
        { uci: uci('e4', 'e5'), book: true, notes: [{ ...note, ideas: [...note.ideas!, second] }] },
      ]),
    });
    const { lesson: marked, traps } = markMistakes(twice);
    expect(marked.positions[keyAfter('e4', 'e5', 'Ba6')].moves).toEqual([
      { uci: uci('e4', 'e5', 'Ba6', 'bxa6'), book: true },
    ]);
    expect(marked.positions[keyAfter('e4')].moves[0].notes![0].ideas).toEqual([
      { type: 'mistake', move: uci('e4', 'e5', 'Ba6') },
    ]);
    expect(traps).toHaveLength(2);
  });
});
