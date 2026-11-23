import { describe, expect, it } from '@jest/globals';

import type { AnalysisLine, Evaluation, FinalAnalysis } from '@/evaluation/evaluation';

import {
  engineVerdict,
  judgeMove,
  judgement,
  labelMove,
  qualityRule,
  refutation,
  verdictText,
} from './quality';

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
  });

  it("labels the same swing in White's score the same for either side, even near a limit", () => {
    // Float subtraction lands each of these a hair from 0.05: 0.06 - 0.01 just
    // under, 0.99 - 0.94 just over. Black's loss must land on the same side.
    expect(judgeMove(scored(0.06), scored(0.01), 'd2d4', 'white')).toBe('good');
    expect(judgeMove(scored(0.01), scored(0.06), 'g7g5', 'black')).toBe('good');
    expect(judgeMove(scored(0.99), scored(0.94), 'd2d4', 'white')).toBe('inaccuracy');
    expect(judgeMove(scored(0.94), scored(0.99), 'g7g5', 'black')).toBe('inaccuracy');
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
      expect(judgement(list, undefined, 'e7e5', 'black')?.evaluation).toEqual(at(0.47));
      expect(judgement(list, undefined, 'a7a6', 'black')).toBeUndefined();
      expect(judgement(list, scored(0.75), 'a7a6', 'black')?.evaluation).toEqual(at(0.75));
      expect(judgement(list, scored(0.4), 'a7a6', 'black')?.evaluation).toEqual(at(0.48));
    });
  });
});

describe('refutation', () => {
  // After White's mistake, Black's best reply scores 0.3 for White.
  const after = (second: number) => listing(['f8c5', 0.3], ['d8d6', second], ['a7a6', 0.55]);

  it("names the replier's best move when its second line would be a mistake beside it", () => {
    expect(refutation('mistake', after(0.45), 'white')).toBe('f8c5');
    expect(refutation('blunder', after(0.45), 'white')).toBe('f8c5');
    // For White replying to Black, from White's side.
    const forWhite = listing(['c1c5', 0.7], ['e2e4', 0.55]);
    expect(refutation('mistake', forWhite, 'black')).toBe('c1c5');
  });

  it('names none when another reply is nearly as good', () => {
    expect(refutation('mistake', after(0.38), 'white')).toBeUndefined();
  });

  it('names none for a move that is no mistake', () => {
    for (const quality of ['book', 'best', 'good', 'inaccuracy', undefined] as const) {
      expect(refutation(quality, after(0.45), 'white')).toBeUndefined();
    }
  });

  it('names none for a forced reply, an analysis without moves, or none yet', () => {
    expect(refutation('blunder', listing(['f8c5', 0.3]), 'white')).toBeUndefined();
    expect(refutation('blunder', scored(0.3), 'white')).toBeUndefined();
    expect(refutation('blunder', undefined, 'white')).toBeUndefined();
  });
});

describe('labelMove', () => {
  const move = { uci: 'e2e4', mover: 'white' } as const;

  it("labels the guide's move book and the only legal move best, without analyses", () => {
    expect(labelMove({ ...move, book: true })).toEqual({ status: 'book', quality: 'book' });
    expect(labelMove({ ...move, legal: 1 })).toEqual({ status: 'forced', quality: 'best' });
  });

  it("is judgement's label otherwise, waiting while an analysis it needs is missing", () => {
    expect(labelMove(move)).toBeUndefined();
    expect(labelMove({ ...move, legal: 20, before: listing(['e2e4', 0.55]) })).toEqual({
      status: 'judged',
      quality: 'best',
      evaluation: at(0.55),
    });
  });
});

describe('qualityRule', () => {
  it("says each label's limits as the labels apply them", () => {
    expect(qualityRule('good')).toBe('gave away under 5% of the winning chances');
    expect(qualityRule('inaccuracy')).toBe('gave away 5% to 10% of the winning chances');
    expect(qualityRule('mistake')).toBe('gave away 10% to 20% of the winning chances');
    expect(qualityRule('blunder')).toBe('gave away 20% or more of the winning chances');
  });
});

describe('engineVerdict', () => {
  /** A final analysis: its moves, each with White's expected score and pawns after it. */
  const analysis = (...lines: [string | undefined, number, number][]): FinalAnalysis => ({
    lines: lines.map(([uci, score, pawns]) => ({ uci, evaluation: { score, pawns } })),
    depth: 19,
    final: true,
  });
  // Black to move, at +0.3 for White.
  const before = analysis(['g8f6', 0.53, 0.3], ['d7d5', 0.6, 0.9], ['c7c5', 0.62, 1.1]);

  it('judges a listed move by its own line, the change for the learner beside it', () => {
    expect(engineVerdict(before, undefined, 'g8f6', 'black', 'black')).toEqual({
      quality: 'best',
      change: { label: '0.0', description: 'No change' },
    });
    expect(engineVerdict(before, undefined, 'd7d5', 'black', 'black')).toEqual({
      quality: 'inaccuracy',
      change: { label: '\u22120.6', description: '0.6 pawns worse for you' },
    });
    // The opponent's slip, as the learner (White) sees it: better for them.
    expect(engineVerdict(before, undefined, 'c7c5', 'black', 'white')).toMatchObject({
      quality: 'inaccuracy',
      change: { label: '+0.8' },
    });
  });

  it('waits for the position after a move the analysis skips, and judges it by that', () => {
    expect(engineVerdict(before, undefined, 'a7a6', 'black', 'black')).toBeUndefined();
    expect(engineVerdict(before, analysis(['e2e4', 0.68, 2.4]), 'a7a6', 'black', 'black')).toEqual({
      quality: 'mistake',
      change: { label: '\u22122.1', description: '2.1 pawns worse for you' },
    });
  });
});

describe('verdictText', () => {
  it('says the label and the change for the learner', () => {
    expect(
      verdictText({
        quality: 'mistake',
        change: { label: '\u22121.6', description: '1.6 pawns worse for you' },
      }),
    ).toBe('Stockfish: Mistake, 1.6 pawns worse for you');
    expect(
      verdictText({
        quality: 'mistake',
        change: { label: '+M2', description: 'You mate in 2' },
      }),
    ).toBe('Stockfish: Mistake, you mate in 2');
  });

  it('says only the label of a move that changes nothing', () => {
    expect(
      verdictText({ quality: 'best', change: { label: '0.0', description: 'No change' } }),
    ).toBe('Stockfish: Best move');
  });
});
