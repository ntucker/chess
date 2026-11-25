import { describe, expect, it } from '@jest/globals';

import type { Lesson, LessonMove, LessonPosition } from './lesson';
import { keyAfter, SAMPLE, uci, uciLine } from './lesson.fixture';
import { mistakeLine } from './mistakes';

const at = (moves: LessonMove[]): LessonPosition => ({ variation: 'caro-kann', moves });
const BA6 = { uci: uci('e4', 'e5', 'Ba6'), mistake: { verdict: 'losesMaterial' as const } };

/** Black's lesson 1.e4 e5, then 2.Nf3 or the marked 2.Ba6?, with `afterBa6` the guide's moves after it. */
const lesson = (afterBa6: LessonMove[], ba6: LessonMove = BA6): Lesson => ({
  ...SAMPLE,
  positions: {
    [keyAfter()]: at([{ uci: uci('e4') }]),
    [keyAfter('e4')]: at([{ uci: uci('e4', 'e5'), book: true }]),
    [keyAfter('e4', 'e5')]: at([{ uci: uci('e4', 'e5', 'Nf3') }, ba6]),
    [keyAfter('e4', 'e5', 'Ba6')]: at(afterBa6),
  },
});
const lineOf = (l: Lesson, ba6: LessonMove = BA6) => mistakeLine(l, keyAfter('e4', 'e5'), ba6);

const NXA6 = { uci: uci('e4', 'e5', 'Ba6', 'Nxa6'), games: [0, 0, 0, 0, 90] };
const BXA6 = { uci: uci('e4', 'e5', 'Ba6', 'bxa6'), games: [0, 0, 0, 0, 10] };

describe('mistakeLine', () => {
  it("follows the learner's book move where it punishes, over a more played one", () => {
    expect(lineOf(lesson([NXA6, { ...BXA6, book: true }]))).toEqual(
      uciLine('e4', 'e5', 'Ba6', 'bxa6').slice(2),
    );
  });

  it('follows the most played move off the book, where the learner has no book move', () => {
    expect(lineOf(lesson([BXA6, NXA6]))).toEqual(uciLine('e4', 'e5', 'Ba6', 'Nxa6').slice(2));
  });

  it('ends where the tree does, or after its plies', () => {
    expect(lineOf(lesson([]))).toEqual([BA6.uci]);
    const cut = { ...BA6, mistake: { ...BA6.mistake, plies: 1 } };
    expect(lineOf(lesson([NXA6], cut), cut)).toEqual([BA6.uci]);
  });

  it('ends once it comes back to a position it passed', () => {
    const nf3 = { uci: uci('e4', 'e5', 'Nf3'), mistake: { verdict: 'equal' as const } };
    const shuffle: Lesson = {
      ...SAMPLE,
      positions: {
        [keyAfter()]: at([{ uci: uci('e4') }]),
        [keyAfter('e4')]: at([{ uci: uci('e4', 'e5'), book: true }]),
        [keyAfter('e4', 'e5')]: at([nf3]),
        [keyAfter('e4', 'e5', 'Nf3')]: at([{ uci: uci('e4', 'e5', 'Nf3', 'Nf6'), book: true }]),
        [keyAfter('e4', 'e5', 'Nf3', 'Nf6')]: at([{ uci: uci('e4', 'e5', 'Nf3', 'Nf6', 'Ng1') }]),
        [keyAfter('e4', 'e5', 'Nf3', 'Nf6', 'Ng1')]: at([
          { uci: uci('e4', 'e5', 'Nf3', 'Nf6', 'Ng1', 'Ng8'), book: true },
        ]),
      },
    };
    expect(mistakeLine(shuffle, keyAfter('e4', 'e5'), nf3)).toEqual(
      uciLine('e4', 'e5', 'Nf3', 'Nf6', 'Ng1', 'Ng8').slice(2),
    );
  });
});
