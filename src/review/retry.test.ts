import { describe, expect, it } from '@jest/globals';

import { legalMoveCountAt, replay } from '@/game/replay';
import type { Lesson } from '@/lesson/lesson';

import { guideAt, type MomentOf, momentAt } from './retry';
import { judgedMove, listing, waitingMove } from './review.fixture';
import { startReview } from './screen';

// 1.e4 e5 2.Qh5, White's mistake, reviewed for White.
const LINE = ['e2e4', 'e7e5', 'd1h5'];
const PLIES = replay(LINE);
const LEGAL = PLIES.map(({ fen }) => legalMoveCountAt(fen));
/** Before 2.Qh5: Nf3 0.55, Nc3 0.53 and Bc4 0.52 for White. */
const BEFORE = listing(['g1f3', 0.55], ['b1c3', 0.53], ['f1c4', 0.52]);
const MISTAKE = judgedMove(2, 'mistake', 0.55, 0.4);

/** The moment at 2.Qh5 (ply 3), with `input` over a mistake and no tries. */
const momentOf = (input: Partial<MomentOf> = {}, screen: Partial<MomentOf['screen']> = {}) =>
  momentAt({
    plies: PLIES,
    moves: [judgedMove(0, 'best'), judgedMove(1, 'best'), MISTAKE],
    analyses: [undefined, undefined, BEFORE, undefined],
    legal: LEGAL,
    learner: 'white',
    book: [],
    tryAnalyses: [],
    tryFailed: [],
    ...input,
    screen: { ...startReview(''), ply: 3, ...screen },
  });

const tried = (...ucis: string[]) => new Map([[3, ucis]]);

describe('momentAt', () => {
  it("hides Stockfish's moves at the learner's mistake, with Stockfish's best as the answer", () => {
    expect(momentOf()).toMatchObject({
      canRetry: true,
      hidden: true,
      revealed: false,
      answer: { uci: 'g1f3', san: 'Nf3', quality: 'best' },
      board: 'game',
    });
  });

  it('passes a listed try that is better than the move, at once', () => {
    const moment = momentOf({}, { tries: tried('b1c3'), board: 'try' });
    expect(moment.tries).toEqual([
      {
        uci: 'b1c3',
        san: 'Nc3',
        status: 'judged',
        quality: 'good',
        change: expect.objectContaining({ label: expect.any(String) }),
        passed: true,
      },
    ]);
    expect(moment).toMatchObject({ revealed: true, hidden: false, searching: undefined });
    expect(moment.shownMove).toEqual({ uci: 'b1c3', quality: 'good' });
  });

  it('waits on the search after a try Stockfish did not list, and searches it first', () => {
    const moment = momentOf({}, { tries: tried('g1f3', 'a2a3') });
    expect(moment.tries[1]).toEqual({ uci: 'a2a3', san: 'a3', status: 'waiting' });
    expect(moment.searching).toBe(1);
  });

  it('judges an unlisted try by the position it reached, and keeps the answer hidden when it fails', () => {
    const moment = momentOf({ tryAnalyses: [listing(['e7e5', 0.3])] }, { tries: tried('a2a3') });
    expect(moment.tries[0]).toMatchObject({ status: 'judged', quality: 'blunder', passed: false });
    expect(moment).toMatchObject({ hidden: true, revealed: false });
  });

  it("marks a try whose search gave up, and doesn't search it again", () => {
    const moment = momentOf({ tryFailed: [true] }, { tries: tried('a2a3') });
    expect(moment.tries[0].status).toBe('failed');
    expect(moment.searching).toBeUndefined();
  });

  it("doesn't pass a try no better than the move", () => {
    // The game's own move again: the store has the position it reaches.
    const repeated = momentOf({ tryAnalyses: [listing(['b8c6', 0.4])] }, { tries: tried('d1h5') });
    expect(repeated.tries[0]).toMatchObject({ status: 'judged', passed: false });
  });

  it('reveals the answer once Show best is pressed, on the board too', () => {
    const moment = momentOf({}, { shown: new Set([3]), board: 'answer' });
    expect(moment).toMatchObject({ revealed: true, hidden: false, canRetry: true });
    expect(moment.shownMove).toEqual({ uci: 'g1f3', quality: 'best' });
  });

  it('has nothing to retry where the board waits for a try already', () => {
    expect(momentOf({}, { board: 'retry' }).canRetry).toBe(false);
  });

  it("shows a fine move's and the opponent's comparison at once", () => {
    const fine = momentOf({
      moves: [judgedMove(0, 'best'), judgedMove(1, 'best'), judgedMove(2, 'good')],
    });
    expect(fine).toMatchObject({ canRetry: false, hidden: false, answer: undefined });
    expect(momentOf({ learner: 'black' })).toMatchObject({ canRetry: false, hidden: false });
  });

  it("hides the learner's move still waiting for its label, with nothing to retry yet", () => {
    const waiting = momentOf({ moves: [judgedMove(0), judgedMove(1), waitingMove(2)] });
    expect(waiting).toMatchObject({ canRetry: false, hidden: true });
  });

  describe('where the learner left the guide', () => {
    const guide = { uci: 'g1f3', practice: { pathname: '/lesson/x', params: {} } } as const;
    const leftGood = {
      moves: [judgedMove(0), judgedMove(1), judgedMove(2, 'good', 0.55, 0.53)],
      leftAt: 2,
      book: ['g1f3'],
      guide,
    };

    it("is retried even after a good move, with the guide's move as the answer", () => {
      expect(momentOf(leftGood)).toMatchObject({
        canRetry: true,
        hidden: true,
        answer: { uci: 'g1f3', quality: 'book', guide },
      });
    });

    it("passes the guide's move, labelled book, but no Stockfish move no better than the game's", () => {
      expect(momentOf(leftGood, { tries: tried('g1f3') }).tries[0]).toMatchObject({
        quality: 'book',
        passed: true,
      });
      expect(momentOf(leftGood, { tries: tried('b1c3') }).revealed).toBe(false);
    });
  });
});

describe('guideAt', () => {
  const lesson = {
    id: 'caro',
    positions: {
      // After 1.e4: the guide's c6, and e5 as a move it doesn't recommend.
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -': {
        variation: 'main',
        moves: [{ uci: 'e7e5' }, { uci: 'c7c6', book: true, notes: [{ text: 'Solid.' }] }],
      },
      'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -': {
        variation: 'advance',
        moves: [],
      },
    },
  } as unknown as Lesson;

  it("names the guide's book moves, and the first as the answer with its note and its line", () => {
    expect(guideAt(lesson, ['e2e4'])).toEqual({
      book: ['c7c6'],
      answer: {
        uci: 'c7c6',
        note: 'Solid.',
        practice: { pathname: '/lesson/caro', params: { variation: 'advance' } },
      },
    });
  });

  it('has nothing beyond the guide', () => {
    expect(guideAt(lesson, ['d2d4'])).toEqual({ book: [], answer: undefined });
  });
});
