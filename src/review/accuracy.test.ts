import { describe, expect, it } from '@jest/globals';

import { gameAccuracy, moveAccuracy } from './accuracy';
import type { ReviewMove } from './review';
import { listing } from './review.fixture';

describe('moveAccuracy', () => {
  it('scores 100 for a move that loses nothing, falling off with the win percent lost', () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 60)).toBe(100);
    // lichess's own numbers: 103.17 e^(-0.0435 x 10) - 3.17, plus its 1-point allowance.
    expect(moveAccuracy(60, 50)).toBeCloseTo(64.6, 1);
    expect(moveAccuracy(100, 0)).toBe(0);
  });
});

/** White's move at `ply` scored from `before` to `after` (White's expected scores), or Black's. */
const judged = (ply: number, before: number, after: number): ReviewMove => {
  const mover = ply % 2 === 0 ? 'white' : 'black';
  const side = (score: number) => (mover === 'white' ? score : 1 - score);
  return { ply, mover, quality: 'good', forced: false, before: side(before), after: side(after) };
};

describe('gameAccuracy', () => {
  // 1. book, 1... 0.5 -> 0.5, 2. 0.5 -> 0.3, 2... 0.3 -> 0.3: White blunders once.
  const moves = [
    { ply: 0, mover: 'white', quality: 'book', forced: false } as const,
    judged(1, 0.5, 0.5),
    judged(2, 0.5, 0.3),
    judged(3, 0.3, 0.3),
  ];
  const analyses = [
    undefined,
    listing(['e7e5', 0.5]),
    listing(['d2d4', 0.5]),
    listing(['x', 0.3]),
    listing(['y', 0.3]),
  ];
  const book = [true];

  it("averages a side's weighted and harmonic means, book moves counting 100", () => {
    expect(gameAccuracy(moves, analyses, book, 'black')).toBe(100);
    const white = gameAccuracy(moves, analyses, book, 'white')!;
    // Book 100 and one move losing 20 points (~43): both means sit between them.
    expect(white).toBeGreaterThan(moveAccuracy(50, 30));
    expect(white).toBeLessThan(100);
  });

  it("waits until every one of the side's moves is judged, leaving out forced ones", () => {
    const unjudged = [...moves.slice(0, 3), { ply: 3, mover: 'black', forced: false } as const];
    expect(gameAccuracy(unjudged, analyses, book, 'black')).toBeUndefined();
    expect(gameAccuracy(unjudged, analyses, book, 'white')).toBeDefined();
    const forced = [...moves.slice(0, 3), { ply: 3, mover: 'black', forced: true } as const];
    expect(gameAccuracy(forced, analyses, book, 'black')).toBe(100);
  });

  it("ignores analyses of positions it doesn't search, so a game's searches can't change it", () => {
    const searchedStart = [listing(['e2e4', 0.9]), ...analyses.slice(1)];
    expect(gameAccuracy(moves, searchedStart, book, 'white')).toBe(
      gameAccuracy(moves, analyses, book, 'white'),
    );
  });
});
