import { describe, expect, it } from '@jest/globals';

import { repliesFrom, walkTo } from './walk';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('repliesFrom', () => {
  it('counts a key that is no move toward the total but gives it no share', () => {
    // No piece stands on h8 at the start, so lichess's key h8h1 is no move there.
    const { key } = walkTo(START, [])!;
    expect(repliesFrom(key, { e2e4: 30, h8h1: 10 }, 50)).toEqual({
      shares: { e2e4: 0.75 },
      thin: true,
    });
  });

  it('throws on a key that is no position', () => {
    expect(() => repliesFrom('not a key', { e2e4: 30 }, 50)).toThrow('Not a position key');
  });
});
