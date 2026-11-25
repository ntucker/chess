import { describe, expect, it } from '@jest/globals';

import { moveGames, moveShare, positionGames } from './share';

describe('moveShare', () => {
  it("divides by the position's own total where measured, else by the listed moves'", () => {
    expect(moveShare(30, 60, 120)).toBe(0.25);
    expect(moveShare(30, 60)).toBe(0.5);
  });

  it('has no share for a move without counts, or where nothing was counted', () => {
    expect(moveShare(undefined, 60)).toBeUndefined();
    expect(moveShare(0, 0)).toBeUndefined();
    expect(moveShare(5, 10, 0)).toBeUndefined();
  });
});

describe('moveGames and positionGames', () => {
  it('read one band, or every band summed', () => {
    expect(moveGames({ uci: 'e2e4', games: [1, 2, 3] }, 1)).toBe(2);
    expect(moveGames({ uci: 'e2e4', games: [1, 2, 3] }, 'all')).toBe(6);
    expect(moveGames({ uci: 'e2e4' }, 'all')).toBeUndefined();
    expect(positionGames({ variation: 'main', moves: [], games: [4, 5] }, 'all')).toBe(9);
  });
});
