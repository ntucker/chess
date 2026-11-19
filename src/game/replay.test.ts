import { describe, expect, it } from '@jest/globals';

import { INITIAL_FEN } from 'chessops/fen';

import { analyze, lastPosition, lineMove, pieceAt, replay, toUci } from './replay';

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
    const mate = lastPosition(['f2f3', 'e7e5', 'g2g4', 'd8h4']);
    expect(mate.result).toEqual({ winner: 'black', reason: 'checkmate' });
    expect(mate.check).toBe(true);
    expect(mate.dests).toEqual({});
  });

  it('lists legal moves by origin square', () => {
    const start = lastPosition([]);
    expect(start.dests.e2).toEqual(['e3', 'e4']);
    expect(Object.keys(start.dests)).toHaveLength(10);
  });
});

describe('lineMove', () => {
  it.each([
    ['e2e4', 'e2e4'],
    ['e2e5', undefined],
    ['nonsense', undefined],
  ])('%s from the start is %s', (uci, recorded) => {
    expect(lineMove(INITIAL_FEN, uci)).toBe(recorded);
  });

  it('writes castling as the king moving two squares', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(lineMove(fen, 'e1h1')).toBe('e1g1');
    expect(lineMove(fen, 'e1g1')).toBe('e1g1');
    expect(lineMove(fen, 'e1a1')).toBe('e1c1');
  });
});

describe('pieceAt', () => {
  it('finds the piece on a square, or nothing', () => {
    const { fen } = lastPosition(['e2e4']);
    expect(pieceAt(fen, 'e4')).toMatchObject({ role: 'pawn', color: 'white' });
    expect(pieceAt(fen, 'e2')).toBeUndefined();
    expect(pieceAt(fen, 'z9')).toBeUndefined();
  });
});

describe('toUci', () => {
  it('promotes pawns to queens and leaves other moves alone', () => {
    const fen = 'r3k3/1P6/8/8/8/8/8/4K1N1 w - - 0 1';
    const ply = { fen, turn: 'white', repetitions: 1 } as const;
    expect(toUci(ply, 'b7', 'a8')).toBe('b7a8q');
    expect(toUci(ply, 'g1', 'f3')).toBe('g1f3');
  });
});
