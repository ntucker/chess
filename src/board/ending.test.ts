import { describe, expect, it } from '@jest/globals';

import { gameEnding } from '@/board/ending';

describe('gameEnding', () => {
  it('is none while the game goes on', () => {
    expect(gameEnding(undefined, 'white')).toBeUndefined();
  });

  it('is a win when the learner mates, and a loss when they are mated', () => {
    const mate = { winner: 'black', reason: 'checkmate' } as const;
    expect(gameEnding(mate, 'black')).toEqual({ mood: 'won', ...mate });
    expect(gameEnding(mate, 'white')).toEqual({ mood: 'lost', ...mate });
  });

  it('is a draw with no winner', () => {
    expect(gameEnding({ reason: 'stalemate' }, 'white')).toEqual({
      mood: 'drawn',
      reason: 'stalemate',
    });
  });
});
