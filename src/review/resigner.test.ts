import { describe, expect, it } from '@jest/globals';

import { analyze, replay } from '@/game/replay';
import { uciLine } from '@/lesson/lesson.fixture';

import { resigner } from './resigner';

describe('resigner', () => {
  it('is the side to move until the game ends', () => {
    const plies = replay(uciLine('f3', 'e5', 'g4', 'Qh4#')).map(analyze);
    expect(resigner(plies[1])).toBe('black');
    expect(resigner(plies[3])).toBe('black');
    expect(resigner(plies[2])).toBe('white');
    // Mated: the game has ended, so nobody resigns.
    expect(resigner(plies[4])).toBeUndefined();
  });
});
