import { describe, expect, it } from '@jest/globals';

import { addressMoves, reviewHref } from './address';

describe('reviewHref', () => {
  it('names the moves, the side and the lesson, which addressMoves reads back', () => {
    const href = reviewHref(['e2e4', 'c7c6'], 'black', 'caro-kann');
    expect(href).toEqual({
      pathname: '/review',
      params: { moves: 'e2e4 c7c6', side: 'black', lesson: 'caro-kann' },
    });
    expect(addressMoves(href.params.moves)).toEqual(['e2e4', 'c7c6']);
  });

  it('leaves the lesson out of a free game, and reads no moves from none', () => {
    const href = reviewHref([], 'white');
    expect(href.params).toEqual({ moves: '', side: 'white' });
    expect(addressMoves(href.params.moves)).toEqual([]);
    expect(addressMoves()).toEqual([]);
  });
});
