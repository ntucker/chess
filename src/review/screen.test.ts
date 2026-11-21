import { describe, expect, it } from '@jest/globals';

import { initialReview, reviewReducer } from './screen';

describe('reviewReducer', () => {
  it('shows a ply, visits it, and forgets the row pointed at and the rest', () => {
    const pointed = reviewReducer({ ...initialReview, ply: 3 }, { type: 'point', uci: 'e2e4' });
    expect(reviewReducer(pointed, { type: 'goto', ply: 5 })).toEqual({
      ply: 5,
      visited: new Set([5]),
    });
  });
});
