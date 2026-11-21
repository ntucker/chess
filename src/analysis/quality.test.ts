import { describe, expect, it } from '@jest/globals';

import type { AnalysisLine, Evaluation, FinalAnalysis } from '@/evaluation/evaluation';

import { judgedEvaluation, judgeMove } from './quality';

/** An evaluation where White's expected score is `score`. */
const at = (score: number): Evaluation => ({ score, pawns: 0 });

/** A final analysis listing `lines` (move, White's expected score after it), best first. */
const listing = (...lines: [string | undefined, number][]): FinalAnalysis => ({
  lines: lines.map(([uci, score]): AnalysisLine => ({
    ...(uci && { uci }),
    evaluation: at(score),
  })),
  depth: 18,
  final: true,
});

/** A position scored `score`, with no move named (like Maia's). */
const scored = (score: number) => listing([undefined, score]);

describe('judgeMove', () => {
  it("calls the first line's move the best, even if the next position scores it lower", () => {
    expect(judgeMove(listing(['e2e4', 0.55]), scored(0.4), 'e2e4', 'white')).toBe('best');
  });

  it('labels other moves by the expected score they give away', () => {
    const white = (after: number) => judgeMove(scored(0.6), scored(after), 'd2d4', 'white');
    expect(white(0.59)).toBe('good');
    expect(white(0.56)).toBe('good');
    expect(white(0.54)).toBe('inaccuracy');
    expect(white(0.51)).toBe('inaccuracy');
    expect(white(0.49)).toBe('mistake');
    expect(white(0.41)).toBe('mistake');
    expect(white(0.39)).toBe('blunder');
    expect(white(0)).toBe('blunder');
  });

  it("measures Black's loss from Black's side", () => {
    const black = (after: number) => judgeMove(scored(0.4), scored(after), 'g7g5', 'black');
    expect(black(0.43)).toBe('good');
    expect(black(0.47)).toBe('inaccuracy');
    expect(black(0.85)).toBe('blunder');
    // The same swing in White's score is the same loss for either side, even at a limit.
    expect(judgeMove(scored(0.01), scored(0.06), 'g7g5', 'black')).toBe(
      judgeMove(scored(0.06), scored(0.01), 'd2d4', 'white'),
    );
  });

  it('calls a move that gives nothing away the best, whichever move the engine names', () => {
    expect(judgeMove(scored(0.5), scored(0.51), 'e2e4', 'white')).toBe('best');
    expect(judgeMove(listing(['d2d4', 0.5]), scored(0.51), 'e2e4', 'white')).toBe('best');
    expect(judgeMove(scored(0.5), scored(0.49), 'e2e4', 'white')).toBe('good');
    // Mate with another move than the engine's: the game is won either way.
    expect(judgeMove(listing(['h4h7', 1]), scored(1), 'h4h8', 'white')).toBe('best');
  });

  it('is typed to take only a finished search, so every screen labels a move the same', () => {
    const deepening = { ...listing(['e2e4', 0.55]), final: false };
    // @ts-expect-error A search still deepening can't label a move.
    expect(judgeMove(deepening, scored(0.55), 'e2e4', 'white')).toBe('best');
  });

  it('calls missing a mate a blunder', () => {
    const mate: FinalAnalysis = {
      lines: [{ uci: 'h4h7', evaluation: { score: 1, pawns: 0, mate: 1 } }],
      depth: 30,
      final: true,
    };
    expect(judgeMove(mate, scored(0.7), 'a2a3', 'white')).toBe('blunder');
  });

  describe('with a list of moves', () => {
    // Black to move after 1.e4: c5 is best, e5 gives away 0.07.
    const list = listing(['c7c5', 0.4], ['e7e5', 0.47], ['e7e6', 0.48]);

    it('judges a listed move by its own line, needing nothing of the position after', () => {
      expect(judgeMove(list, undefined, 'e7e5', 'black')).toBe('inaccuracy');
      // The position after's own search may disagree: the list decides.
      expect(judgeMove(list, scored(0.41), 'e7e5', 'black')).toBe('inaccuracy');
      expect(judgeMove(list, undefined, 'c7c5', 'black')).toBe('best');
    });

    it('judges a move the list skips by the position after, once that is known', () => {
      expect(judgeMove(list, undefined, 'a7a6', 'black')).toBe(undefined);
      expect(judgeMove(list, scored(0.75), 'a7a6', 'black')).toBe('blunder');
    });

    it('never judges a move the list skips as better than its last move', () => {
      // The next position's search scores a6 as well as c5, but the list ranked it below e6.
      expect(judgeMove(list, scored(0.4), 'a7a6', 'black')).toBe('inaccuracy');
    });

    it('gives the evaluation it judges by: the own line, else the position after, but no better than the last', () => {
      expect(judgedEvaluation(list, undefined, 'e7e5', 'black')).toEqual(at(0.47));
      expect(judgedEvaluation(list, undefined, 'a7a6', 'black')).toBeUndefined();
      expect(judgedEvaluation(list, scored(0.75), 'a7a6', 'black')).toEqual(at(0.75));
      expect(judgedEvaluation(list, scored(0.4), 'a7a6', 'black')).toEqual(at(0.48));
    });
  });
});
