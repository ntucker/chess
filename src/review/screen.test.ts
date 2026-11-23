import { describe, expect, it } from '@jest/globals';

import { reviewReducer, startReview } from './screen';

const GAME = 'black e2e4 e7e5 g1f3 b8c6 f1b5';
const initialReview = startReview(GAME);

describe('reviewReducer', () => {
  it('shows a ply, visits it, and forgets the row pointed at and the rest', () => {
    const pointed = reviewReducer(
      { ...initialReview, ply: 3, dwelt: 3 },
      { type: 'point', uci: 'e2e4' },
    );
    expect(reviewReducer(pointed, { type: 'goto', ply: 5 })).toEqual({
      ...initialReview,
      ply: 5,
      visited: new Set([5]),
    });
  });

  it('stays within the game, as the arrow keys step past either end', () => {
    const last = reviewReducer(initialReview, { type: 'goto', ply: 5 });
    expect(reviewReducer(last, { type: 'goto', ply: 6 })).toBe(last);
    expect(reviewReducer(initialReview, { type: 'goto', ply: -1 })).toBe(initialReview);
  });

  it('rests only on the ply still shown', () => {
    const shown = reviewReducer(initialReview, { type: 'goto', ply: 2 });
    expect(reviewReducer(shown, { type: 'dwell', ply: 1 })).toBe(shown);
    expect(reviewReducer(shown, { type: 'dwell', ply: 2 }).dwelt).toBe(2);
  });

  it('keeps the visited set itself when the board returns to a ply it showed', () => {
    const seen = [3, 5].reduce(
      (state, ply) => reviewReducer(state, { type: 'goto', ply }),
      initialReview,
    );
    const back = reviewReducer(seen, { type: 'goto', ply: 3 });
    expect(back.ply).toBe(3);
    expect(back.visited).toBe(seen.visited);
  });

  it('starts afresh for another game, and keeps the review of the same one', () => {
    const shown = reviewReducer(initialReview, { type: 'goto', ply: 1 });
    expect(reviewReducer(shown, { type: 'review', game: GAME })).toBe(shown);
    expect(reviewReducer(shown, { type: 'review', game: 'white d2d4' })).toEqual(
      startReview('white d2d4'),
    );
  });

  it("keeps each moment's tries and answers shown, and ends what the board shows on leaving it", () => {
    const atMoment = reviewReducer(initialReview, { type: 'goto', ply: 3 });
    // A try waits for Retry.
    expect(reviewReducer(atMoment, { type: 'try', uci: 'g1f3' })).toBe(atMoment);
    const retrying = reviewReducer(atMoment, { type: 'retry' });
    expect(retrying.board).toBe('retry');
    expect(reviewReducer(retrying, { type: 'retry' })).toBe(retrying);
    const tried = [
      { type: 'try', uci: 'g1f3' },
      { type: 'retry' },
      { type: 'try', uci: 'b1c3' },
    ] as const;
    const twice = tried.reduce(reviewReducer, retrying);
    expect(twice.tries.get(3)).toEqual(['g1f3', 'b1c3']);
    expect(twice.board).toBe('try');
    const answered = reviewReducer(twice, { type: 'show answer' });
    expect(answered.shown).toEqual(new Set([3]));
    expect(answered.board).toBe('answer');

    const away = reviewReducer(answered, { type: 'goto', ply: 5 });
    expect(away.board).toBeUndefined();
    const back = reviewReducer(away, { type: 'goto', ply: 3 });
    expect(back.tries).toBe(answered.tries);
    expect(back.shown).toBe(answered.shown);
  });
});
