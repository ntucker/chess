import { describe, expect, it } from '@jest/globals';

import { lastPosition } from '@/game/replay';

import { endingExamples } from '@/board/endingExamples';

describe('endingExamples', () => {
  it('each ends the game the way its title says', () => {
    const results = endingExamples.map(({ line }) => lastPosition(line).result);
    expect(results).toEqual([
      { winner: 'white', reason: 'checkmate' },
      { winner: 'black', reason: 'checkmate' },
      { reason: 'stalemate' },
    ]);
  });
});
