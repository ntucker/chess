import { describe, expect, it } from '@jest/globals';

import { reviewReducer, startReview } from './screen';

const initialReview = startReview('black e2e4');

describe('reviewReducer', () => {
  it('shows a ply, visits it, and forgets the row pointed at and the rest', () => {
    const pointed = reviewReducer(
      { ...initialReview, ply: 3, dwelt: 3 },
      { type: 'point', uci: 'e2e4' },
    );
    expect(reviewReducer(pointed, { type: 'goto', ply: 5 })).toEqual({
      game: 'black e2e4',
      ply: 5,
      visited: new Set([5]),
    });
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
    expect(reviewReducer(shown, { type: 'review', game: 'black e2e4' })).toBe(shown);
    expect(reviewReducer(shown, { type: 'review', game: 'white d2d4' })).toEqual(
      startReview('white d2d4'),
    );
  });
});
