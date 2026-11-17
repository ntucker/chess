import { describe, expect, it } from '@jest/globals';

import { analyze, isLegal, replay, toUci } from './replay';

describe('replay', () => {
  it('returns a position per move, with SAN', () => {
    const plies = replay(['e2e4', 'e7e5', 'g1f3']);
    expect(plies.map((p) => p.move?.san)).toEqual([undefined, 'e4', 'e5', 'Nf3']);
    expect(plies[3].move).toEqual({ uci: 'g1f3', san: 'Nf3', from: 'g1', to: 'f3' });
    expect(plies[3].turn).toBe('black');
  });

  it('stops at the first illegal move', () => {
    expect(replay(['e2e4', 'e2e4', 'e7e5'])).toHaveLength(2);
  });

  it('counts repetitions and ends the game on the third', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const plies = replay([...shuffle, ...shuffle]);
    expect(plies.map((p) => p.repetitions)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3]);
    expect(analyze(plies[7]).result).toBeUndefined();
    expect(analyze(plies[8]).result).toEqual({ reason: 'threefold repetition' });
  });
});

describe('analyze', () => {
  it('finds checkmate, its winner, and no legal moves', () => {
    const mate = analyze(replay(['f2f3', 'e7e5', 'g2g4', 'd8h4']).at(-1)!);
    expect(mate.result).toEqual({ winner: 'black', reason: 'checkmate' });
    expect(mate.check).toBe(true);
    expect(mate.dests).toEqual({});
  });

  it('lists legal moves by origin square', () => {
    const start = analyze(replay([])[0]);
    expect(start.dests.e2).toEqual(['e3', 'e4']);
    expect(Object.keys(start.dests)).toHaveLength(10);
  });
});

describe('isLegal', () => {
  const start = replay([])[0].fen;
  it.each([
    ['e2e4', true],
    ['e2e5', false],
    ['nonsense', false],
  ])('%s is %s from the start', (uci, legal) => {
    expect(isLegal(start, uci)).toBe(legal);
  });
});

describe('toUci', () => {
  it('promotes pawns to queens and leaves other moves alone', () => {
    // White's pawn on b7 can take the rook on a8.
    const ply = replay(['b2b4', 'a7a5', 'b4a5', 'b7b6', 'a5b6', 'c8a6', 'b6b7', 'a6b5'])[8];
    expect(toUci(ply, 'b7', 'a8')).toBe('b7a8q');
    expect(toUci(ply, 'g1', 'f3')).toBe('g1f3');
  });
});
