import { describe, expect, it } from '@jest/globals';

import { gameAccuracy, moveAccuracy } from './accuracy';
import {
  bookMove,
  failedMove,
  forcedMove,
  judgedMove,
  listing,
  waitingMove,
} from './review.fixture';

describe('moveAccuracy', () => {
  it('scores 100 for a move that loses nothing, falling off with the win percent lost', () => {
    expect(moveAccuracy(50, 50)).toBe(100);
    expect(moveAccuracy(50, 60)).toBe(100);
    // lichess's own numbers: 103.17 e^(-0.0435 x 10) - 3.17, plus its 1-point allowance.
    expect(moveAccuracy(60, 50)).toBeCloseTo(64.6, 1);
    expect(moveAccuracy(100, 0)).toBe(0);
  });
});

/** No failed searches. */
const none: ReadonlySet<number> = new Set();

/** Final analyses where White's expected score is each of `scores`. */
const finals = (...scores: number[]) => scores.map((score) => listing(['a', score]));

/** `count` moves judged best at an even game, except `blunder` (White's 0.5 -> 0.3). */
const game = (count: number, blunder?: number) =>
  Array.from({ length: count }, (_, ply) =>
    ply === blunder ? judgedMove(ply, 'blunder', 0.5, 0.3) : judgedMove(ply, 'best', 0.5),
  );

/** White's expected score in each position of `game(count, blunder)`. */
const gameScores = (count: number, blunder?: number) =>
  Array.from({ length: count + 1 }, (_, ply) =>
    blunder !== undefined && ply > blunder ? 0.3 : 0.5,
  );

describe('gameAccuracy', () => {
  // 18 moves, nine a side; White blunders once, at ply 6.
  const moves = game(18, 6);
  const analyses = finals(...gameScores(18, 6));

  it("averages a side's weighted and harmonic means", () => {
    expect(gameAccuracy(moves, analyses, [], 'black', none)).toBe(100);
    const white = gameAccuracy(moves, analyses, [], 'white', none) as number;
    // Eight moves at 100 and one losing 20 points (about 41): both means sit between them.
    expect(white).toBeGreaterThan(moveAccuracy(50, 30));
    expect(white).toBeLessThan(100);
  });

  it('floors a move scored 0 at 1 in the harmonic mean, so blunders cannot zero it', () => {
    // Each side gives away 90 points with every move: every move scores 0.
    const swings = Array.from({ length: 16 }, (_, ply) =>
      ply % 2 === 0
        ? judgedMove(ply, 'blunder', 0.95, 0.05)
        : judgedMove(ply, 'blunder', 0.05, 0.95),
    );
    const scores = Array.from({ length: 17 }, (_, ply) => (ply % 2 === 0 ? 0.95 : 0.05));
    expect(moveAccuracy(95, 5)).toBe(0);
    // Weighted mean 0, harmonic mean 1.
    expect(gameAccuracy(swings, finals(...scores), [], 'white', none)).toBe(0.5);
  });

  it('weights a move by how much the game swung where it was played', () => {
    // Twenty moves, so each window is 2 positions. White gives away 30 points
    // at ply 6 and nothing elsewhere; only the swings around it differ.
    const twenty = Array.from({ length: 20 }, (_, ply) =>
      ply === 6 ? judgedMove(ply, 'blunder', 0.5, 0.2) : judgedMove(ply, 'best', 0.5),
    );
    const accuracy = (scores: number[]) =>
      gameAccuracy(twenty, finals(...scores), [], 'white', none) as number;
    const calm = accuracy(Array.from({ length: 21 }, () => 0.5));
    const wild = accuracy(
      Array.from({ length: 21 }, (_, ply) => (ply < 6 ? 0.5 : ply === 6 ? 0.9 : 0.2)),
    );
    // Where the game swung, the blunder weighs more, so the side scores lower.
    expect(wild).toBeLessThan(calm - 1);
  });

  it('leaves out book, forced and failed moves, and gives no number under 8 judged moves', () => {
    expect(gameAccuracy(game(12), finals(...gameScores(12)), [], 'white', none)).toBe('brief');
    // One book and one forced move leave White seven of nine.
    const book = [true];
    const someLeftOut = [bookMove(0), ...moves.slice(1, 2), forcedMove(2), ...moves.slice(3)];
    expect(gameAccuracy(someLeftOut, analyses, book, 'white', none)).toBe('brief');
    expect(gameAccuracy(someLeftOut, analyses, book, 'black', none)).toBe(100);
    // A failed position isn't waited for, and its moves don't count.
    const failed = new Set([18]);
    const lastFailed = [...moves.slice(0, 17), failedMove(17)];
    const unsearched = [...analyses.slice(0, 18), undefined];
    // Black keeps eight of its nine moves.
    expect(gameAccuracy(lastFailed, unsearched, [], 'black', failed)).toBe(100);
    expect(gameAccuracy(lastFailed, unsearched, [], 'white', failed)).toBe(
      gameAccuracy(moves, analyses, [], 'white', none),
    );
  });

  it('waits until every position the review searches is final', () => {
    const waiting = [...moves.slice(0, 17), waitingMove(17)];
    // White's moves are all judged, but a window reads the position still searched.
    expect(gameAccuracy(waiting, [...analyses.slice(0, 18), undefined], [], 'white', none)).toBe(
      undefined,
    );
  });

  it("ignores analyses of positions it doesn't search, so a game's searches can't change it", () => {
    const book = [true, true];
    const fromBook = [bookMove(0), bookMove(1), ...game(20, 6).slice(2)];
    const scores = finals(...gameScores(20, 6));
    const searchedStart = [listing(['e2e4', 0.9]), ...scores.slice(1)];
    expect(gameAccuracy(fromBook, searchedStart, book, 'white', none)).toBe(
      gameAccuracy(fromBook, scores, book, 'white', none),
    );
  });
});
