import { describe, expect, it } from '@jest/globals';

import { replay } from '@/game/replay';
import { ADVANCE, SAMPLE, uciLine } from '@/lesson/lesson.fixture';
import { bookMoves } from '@/lesson/select';

import { judgedPosition, leftGuide, moments, reviewMoves, tally } from './review';
import { bookMove, judgedMove, listing, waitingMove } from './review.fixture';

const line = uciLine('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4');
const plies = replay(line);
const legal = plies.map(() => 20);

describe('reviewMoves', () => {
  it("labels each move from its positions' final analyses, as the game does", () => {
    const analyses = [
      listing(['e2e4', 0.53]),
      listing(['e7e5', 0.53]),
      listing(['g1f3', 0.53]),
      listing(['b8c6', 0.53]),
      listing(['f1c4', 0.52]),
      listing(['g8f6', 0.52]),
      undefined,
    ];
    const moves = reviewMoves({ plies, book: [], legal, analyses });
    expect(moves.map(({ quality }) => quality)).toEqual([
      'best',
      'best',
      'best',
      'best',
      'best',
      undefined,
    ]);
    // 5...Nd4 isn't listed, so it waits for the position after it.
    const later = reviewMoves({
      plies,
      book: [],
      legal,
      analyses: [...analyses.slice(0, -1), listing(['f3d4', 0.75])],
    });
    expect(later[5]).toEqual({
      ply: 5,
      mover: 'black',
      status: 'judged',
      quality: 'blunder',
      before: 1 - 0.52,
      after: 1 - 0.75,
    });
  });

  it('labels book moves without analyses, and leaves forced moves unlabelled', () => {
    const moves = reviewMoves({
      plies,
      book: [true, false, true],
      legal: [20, 1, 20, 20, 20, 20, 20],
      analyses: [],
    });
    expect(moves.slice(0, 3)).toEqual([
      { ply: 0, mover: 'white', status: 'book', quality: 'book' },
      { ply: 1, mover: 'black', status: 'forced' },
      { ply: 2, mover: 'white', status: 'book', quality: 'book' },
    ]);
  });
});

describe('judgedPosition', () => {
  it('searches only positions a move off the guide leads into or out of', () => {
    const book = [true, true, true, false, true];
    expect([0, 1, 2, 3, 4, 5].map((ply) => judgedPosition(book, ply, 5))).toEqual([
      false,
      false,
      false,
      true,
      true,
      false,
    ]);
    // The final position, after a move off the guide.
    expect(judgedPosition([true, false], 2, 2)).toBe(true);
  });
});

describe('leftGuide', () => {
  it("finds the learner's first move off the guide where the guide recommends one", () => {
    const left = uciLine(...ADVANCE, 'a6');
    expect(leftGuide(SAMPLE, left, 'black', bookMoves(SAMPLE, left))).toBe(5);
  });

  it('is undefined while the learner follows the guide, or when the opponent leaves it first', () => {
    const followed = uciLine(...ADVANCE);
    expect(leftGuide(SAMPLE, followed, 'black', bookMoves(SAMPLE, followed))).toBeUndefined();
    const opponentLeft = uciLine('e4', 'c6', 'a3', 'a6');
    expect(
      leftGuide(SAMPLE, opponentLeft, 'black', bookMoves(SAMPLE, opponentLeft)),
    ).toBeUndefined();
  });
});

describe('moments', () => {
  const moves = [
    bookMove(0),
    judgedMove(1, 'blunder'),
    judgedMove(2, 'good'),
    judgedMove(3, 'mistake'),
    judgedMove(4, 'blunder'),
    judgedMove(5, 'inaccuracy'),
    waitingMove(6),
  ];

  it("lists the learner's mistakes and blunders, and where they left the guide, in game order", () => {
    expect(moments(moves, 'white', 2)).toEqual([2, 4]);
    expect(moments(moves, 'black')).toEqual([1, 3]);
    expect(moments(moves, 'black', 5)).toEqual([1, 3, 5]);
  });
});

describe('tally', () => {
  it("counts each label of a side's judged moves", () => {
    const moves = [
      bookMove(0),
      judgedMove(1, 'best'),
      judgedMove(2, 'blunder'),
      waitingMove(3),
      judgedMove(4, 'blunder'),
    ];
    expect(tally(moves, 'white')).toEqual({ book: 1, blunder: 2 });
    expect(tally(moves, 'black')).toEqual({ best: 1 });
  });
});
