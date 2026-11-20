import { describe, expect, it } from '@jest/globals';

import {
  evaluationFromScore,
  forwardNeededLines,
  multiPvCommand,
  NO_LINES,
  parseInfo,
  positionCommand,
  type RankedLines,
  rankedLines,
  rankLine,
} from './uci';

describe('parseInfo', () => {
  it("reads a finished depth's line: its rank, score and first move", () => {
    expect(
      parseInfo(
        'info depth 16 seldepth 22 multipv 1 score cp -34 nodes 98123 nps 400000 hashfull 120 tbhits 0 time 245 pv e7e5 g1f3',
      ),
    ).toEqual({ rank: 1, score: { kind: 'cp', value: -34 }, move: 'e7e5' });
    expect(parseInfo('info depth 3 seldepth 2 multipv 3 score mate -1 nodes 40 pv d8h4')).toEqual({
      rank: 3,
      score: { kind: 'mate', value: -1 },
      move: 'd8h4',
    });
    // A mated side has no move; a line without multipv is the best.
    expect(parseInfo('info depth 0 score mate 0')).toEqual({
      rank: 1,
      score: { kind: 'mate', value: 0 },
    });
  });

  it('marks a score that is only a bound, and skips other lines', () => {
    expect(parseInfo('info depth 18 seldepth 25 score cp 40 lowerbound nodes 3 pv e2e4')).toEqual({
      rank: 1,
      score: { kind: 'cp', value: 40 },
      move: 'e2e4',
      bound: true,
    });
    expect(parseInfo('info depth 18 currmove e2e4 currmovenumber 1')).toBe(undefined);
    expect(parseInfo('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBe(undefined);
    expect(parseInfo('bestmove e2e4 ponder e7e5')).toBe(undefined);
  });
});

describe('rankLine', () => {
  const rank = (lines: string[]) =>
    rankedLines(
      lines.reduce<RankedLines<string>>((ranked, line) => {
        const info = parseInfo(line)!;
        return rankLine(ranked, info, info.move!);
      }, NO_LINES),
    );

  it("keeps one depth's set whole, so no move is listed twice", () => {
    expect(
      rank([
        'info depth 12 multipv 1 score cp 47 nodes 68832 pv g2g3',
        'info depth 12 multipv 2 score cp 47 nodes 68832 pv c3e2',
        'info depth 13 multipv 1 score cp 58 nodes 100003 pv h2h4',
        'info depth 13 multipv 2 score cp 50 nodes 100003 pv g2g3',
      ]),
    ).toEqual(['h2h4', 'g2g3']);
  });

  it("drops a set with a lower rank's bound, keeping the depth before", () => {
    // Stockfish's output at the node limit, 1.e4 c6 2.d4 d5 3.e5 Bf5 4.Nf3 e6
    // 5.Bd3 Bxd3 6.Qxd3 Nd7 7.c3 c5 8.O-O cxd4 9.cxd4 Ne7 10.Nc3 Nc6: the
    // search stopped inside the last depth's third line.
    const lines = [
      'info depth 12 multipv 1 score cp 47 nodes 68832 pv g2g3',
      'info depth 12 multipv 2 score cp 47 nodes 68832 pv c3e2',
      'info depth 12 multipv 3 score cp 46 nodes 68832 pv h2h4',
      'info depth 13 multipv 1 score cp 58 nodes 100003 pv h2h4',
      'info depth 13 multipv 2 score cp 50 nodes 100003 pv g2g3',
      'info depth 13 multipv 3 score cp 45 upperbound nodes 100003 pv c3e2',
    ];
    expect(rank(lines)).toEqual(['g2g3', 'c3e2', 'h2h4']);
    // A whole set with exact scores counts before the next set starts.
    expect(rank(lines.slice(0, 3))).toEqual(['g2g3', 'c3e2', 'h2h4']);
  });

  it('drops a set whose best line is only a bound, keeping the depth before', () => {
    expect(
      rank([
        'info depth 12 multipv 1 score cp 47 nodes 68832 pv g2g3',
        'info depth 12 multipv 2 score cp 46 nodes 68832 pv h2h4',
        'info depth 13 multipv 1 score cp 58 lowerbound nodes 100003 pv h2h4',
        'info depth 13 multipv 2 score cp 47 nodes 100003 pv g2g3',
      ]),
    ).toEqual(['g2g3', 'h2h4']);
  });
});

describe('multiPvCommand', () => {
  it('sets how many moves a search ranks', () => {
    expect(multiPvCommand(3)).toBe('setoption name MultiPV value 3');
  });
});

describe('forwardNeededLines', () => {
  it("passes on the handshake, and each search's last score with its best move", () => {
    const passed: string[] = [];
    const pass = forwardNeededLines((line) => passed.push(line));
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

  it("passes on each rank's last line, best first", () => {
    const passed: string[] = [];
    const pass = forwardNeededLines((line) => passed.push(line));
    for (const line of [
      'info depth 1 multipv 1 score cp 30 nodes 20 pv e2e4',
      'info depth 1 multipv 2 score cp 20 nodes 20 pv d2d4',
      'info depth 2 multipv 1 score cp 25 nodes 60 pv d2d4',
      'info depth 2 multipv 2 score cp 22 nodes 60 pv e2e4',
      'info depth 2 multipv 3 score cp 10 nodes 60 pv g1f3',
      'bestmove d2d4 ponder d7d5',
      'info depth 1 multipv 1 score cp 5 nodes 20 pv e7e5',
      'bestmove e7e5',
    ])
      pass(line);
    expect(passed).toEqual([
      'info depth 2 multipv 1 score cp 25 nodes 60 pv d2d4',
      'info depth 2 multipv 2 score cp 22 nodes 60 pv e2e4',
      'info depth 2 multipv 3 score cp 10 nodes 60 pv g1f3',
      'bestmove d2d4 ponder d7d5',
      // The next search starts with no ranks left over.
      'info depth 1 multipv 1 score cp 5 nodes 20 pv e7e5',
      'bestmove e7e5',
    ]);
  });
});

describe('positionCommand', () => {
  it('plays the line from the starting position', () => {
    expect(positionCommand([])).toBe('position startpos');
    expect(positionCommand(['e2e4', 'e7e5', 'g1f3'])).toBe(
      'position startpos moves e2e4 e7e5 g1f3',
    );
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
    expect(evaluationFromScore({ kind: 'mate', value: 1 }, 1)).toMatchObject({
      score: 0,
      mate: -1,
    });
    // White to move is already mated.
    expect(evaluationFromScore({ kind: 'mate', value: 0 }, 2)).toMatchObject({ score: 0, mate: 0 });
  });
});
