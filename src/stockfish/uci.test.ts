import { describe, expect, it } from '@jest/globals';

import { evaluationFromScore, neededLines, parseScore, positionCommand } from './uci';

describe('parseScore', () => {
  it("reads a finished depth's score", () => {
    expect(
      parseScore(
        'info depth 16 seldepth 22 multipv 1 score cp -34 nodes 98123 nps 400000 hashfull 120 tbhits 0 time 245 pv e7e5 g1f3',
      ),
    ).toEqual({ kind: 'cp', value: -34 });
    expect(parseScore('info depth 3 seldepth 2 multipv 1 score mate -1 nodes 40 pv d8h4')).toEqual({
      kind: 'mate',
      value: -1,
    });
  });

  it('skips bounds and other lines', () => {
    expect(parseScore('info depth 18 seldepth 25 score cp 40 lowerbound nodes 3 pv e2e4')).toBe(
      undefined,
    );
    expect(parseScore('info depth 18 currmove e2e4 currmovenumber 1')).toBe(undefined);
    expect(parseScore('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBe(undefined);
    expect(parseScore('bestmove e2e4 ponder e7e5')).toBe(undefined);
  });
});

describe('neededLines', () => {
  it('passes on the handshake, and each search\'s last score with its best move', () => {
    const passed: string[] = [];
    const pass = neededLines((line) => passed.push(line));
    for (const line of [
      'id name Stockfish 19',
      'uciok',
      'info depth 1 score cp 10 nodes 20 pv e2e4',
      'info depth 2 currmove e2e4 currmovenumber 1',
      'info depth 2 score cp 30 lowerbound nodes 40 pv e2e4',
      'info depth 2 score cp 20 nodes 60 pv e2e4',
      'bestmove e2e4 ponder e7e5',
      'bestmove (none)',
    ])
      pass(line);
    expect(passed).toEqual([
      'uciok',
      'info depth 2 score cp 20 nodes 60 pv e2e4',
      'bestmove e2e4 ponder e7e5',
      'bestmove (none)',
    ]);
  });
});

describe('positionCommand', () => {
  it('plays the line from the starting position', () => {
    expect(positionCommand([])).toBe('position startpos');
    expect(positionCommand(['e2e4', 'e7e5', 'g1f3'])).toBe('position startpos moves e2e4 e7e5 g1f3');
  });
});

describe('evaluationFromScore', () => {
  it("turns the side to move's centipawns into White's", () => {
    expect(evaluationFromScore({ kind: 'cp', value: 0 }, 0)).toEqual({ score: 0.5, pawns: 0 });
    const white = evaluationFromScore({ kind: 'cp', value: 150 }, 0);
    const black = evaluationFromScore({ kind: 'cp', value: 150 }, 1);
    expect(white.pawns).toBe(1.5);
    expect(black.pawns).toBe(-1.5);
    // lichess's curve: +1.5 pawns is about a 63% expected score.
    expect(white.score).toBeCloseTo(0.6347, 4);
    expect(black.score).toBeCloseTo(1 - white.score, 10);
  });

  it('gives mates to the side that mates', () => {
    // White to move mates in 2.
    expect(evaluationFromScore({ kind: 'mate', value: 2 }, 0)).toEqual({
      score: 1,
      pawns: 0,
      mate: 2,
    });
    // Black to move is mated in 3.
    expect(evaluationFromScore({ kind: 'mate', value: -3 }, 1)).toEqual({
      score: 1,
      pawns: 0,
      mate: 3,
    });
    // Black to move mates in 1.
    expect(evaluationFromScore({ kind: 'mate', value: 1 }, 1)).toMatchObject({ score: 0, mate: -1 });
    // White to move is already mated.
    expect(evaluationFromScore({ kind: 'mate', value: 0 }, 2)).toMatchObject({ score: 0, mate: 0 });
  });
});
