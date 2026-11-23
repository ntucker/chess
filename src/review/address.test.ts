import { describe, expect, it } from '@jest/globals';

import { addressMoves, playOnHref, reviewHref } from './address';

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

describe('addressMoves', () => {
  it('stops at the first move that is not legal', () => {
    expect(addressMoves('e2e4 e2e5 e7e5')).toEqual(['e2e4']);
  });
});

describe('playOnHref', () => {
  it("opens a lesson's page at the moves, which plays from the lesson's side", () => {
    expect(playOnHref(['e2e4', 'c7c6'], 'black', 'caro-kann')).toEqual({
      pathname: '/lesson/caro-kann',
      params: { moves: 'e2e4 c7c6' },
    });
  });

  it("opens the free-game page at the moves, from the learner's side", () => {
    expect(playOnHref(['e2e4', 'c7c6'], 'black')).toEqual({
      pathname: '/play',
      params: { moves: 'e2e4 c7c6', side: 'black' },
    });
  });
});
