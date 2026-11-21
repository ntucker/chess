import { describe, expect, it } from '@jest/globals';

import { gameAccuracy, moveAccuracy } from './accuracy';
import { bookMove, judgedMove, listing, unjudgedMove } from './review.fixture';

describe('moveAccuracy', () => {
  it('scores 100 for a move that loses nothing, falling off with the win percent lost', () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 60)).toBe(100);
    // lichess's own numbers: 103.17 e^(-0.0435 x 10) - 3.17, plus its 1-point allowance.
    expect(moveAccuracy(60, 50)).toBeCloseTo(64.6, 1);
    expect(moveAccuracy(100, 0)).toBe(0);
  });
});

/** Final analyses where White's expected score is each of `scores`. */
const finals = (...scores: number[]) => scores.map((score) => listing(['a', score]));

describe('gameAccuracy', () => {
  // 1. book, 1... 0.5 -> 0.5, 2. 0.5 -> 0.3, 2... 0.3 -> 0.3: White blunders once.
  const moves = [
    bookMove(0),
    judgedMove(1, 'best', 0.5),
    judgedMove(2, 'blunder', 0.5, 0.3),
    judgedMove(3, 'best', 0.3),
  ];
  const book = [true];
  const analyses = [undefined, ...finals(0.5, 0.5, 0.3, 0.3)];

  it("averages a side's weighted and harmonic means, book moves counting 100", () => {
    expect(gameAccuracy(moves, analyses, book, 'black')).toBe(100);
    const white = gameAccuracy(moves, analyses, book, 'white')!;
    // Book 100 and one move losing 20 points (about 41): both means sit between them.
    expect(white).toBeGreaterThan(moveAccuracy(50, 30));
    expect(white).toBeLessThan(100);
  });

  it('weights a move by how much the game swung where it was played', () => {
    // Ten moves, so each window is 2 positions. White gives away 30 points
    // at ply 6 and nothing elsewhere; only the swings around it differ.
    const tenMoves = Array.from({ length: 10 }, (_, ply) =>
      ply === 6 ? judgedMove(ply, 'blunder', 0.5, 0.2) : judgedMove(ply, 'best', 0.5),
    );
    const accuracy = (...scores: number[]) =>
      gameAccuracy(tenMoves, finals(...scores), [], 'white')!;
    const calm = accuracy(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    const wild = accuracy(0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.9, 0.2, 0.2, 0.2, 0.2);
    // Where the game swung, the blunder weighs more, so the side scores lower.
    expect(wild).toBeLessThan(calm - 1);
  });

  it('waits until every position the review searches is final, leaving out forced moves', () => {
    const waiting = [...analyses.slice(0, 3), undefined, analyses[4]];
    const judgedSoFar = [...moves.slice(0, 2), unjudgedMove(2), unjudgedMove(3)];
    expect(gameAccuracy(judgedSoFar, waiting, book, 'black')).toBeUndefined();
    // White's moves are all judged, but a window reads the position still searched.
    const whiteJudged = [...moves.slice(0, 3), unjudgedMove(3)];
    expect(gameAccuracy(whiteJudged, [...analyses.slice(0, 4), undefined], book, 'white')).toBe(
      undefined,
    );
    const forced = [...moves.slice(0, 3), unjudgedMove(3, 'forced')];
    expect(gameAccuracy(forced, analyses, book, 'black')).toBe(100);
  });

  it("ignores analyses of positions it doesn't search, so a game's searches can't change it", () => {
    const searchedStart = [listing(['e2e4', 0.9]), ...analyses.slice(1)];
    expect(gameAccuracy(moves, searchedStart, book, 'white')).toBe(
      gameAccuracy(moves, analyses, book, 'white'),
    );
  });
});
