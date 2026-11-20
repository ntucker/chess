import { describe, expect, it } from '@jest/globals';

import {
  addLine,
  evaluationFromScore,
  forwardNeededLines,
  isWholeDepth,
  multiPvCommand,
  parseInfo,
  positionCommand,
  type SearchLine,
} from './uci';

describe('parseInfo', () => {
  it("reads a finished depth's line: its rank, score and first move", () => {
    expect(
      parseInfo(
        'info depth 16 seldepth 22 multipv 1 score cp -34 nodes 98123 nps 400000 hashfull 120 tbhits 0 time 245 pv e7e5 g1f3',
      ),
    ).toEqual({
      rank: 1,
      depth: 16,
      nodes: 98123,
      score: { kind: 'cp', value: -34 },
      move: 'e7e5',
    });
    expect(parseInfo('info depth 3 seldepth 2 multipv 3 score mate -1 nodes 40 pv d8h4')).toEqual({
      rank: 3,
      depth: 3,
      nodes: 40,
      score: { kind: 'mate', value: -1 },
      move: 'd8h4',
    });
    // A mated side has no move; a line without multipv is the best.
    expect(parseInfo('info depth 0 score mate 0')).toEqual({
      rank: 1,
      depth: 0,
      nodes: 0,
      score: { kind: 'mate', value: 0 },
    });
  });

  it('marks a score that is only a bound, and skips other lines', () => {
    expect(parseInfo('info depth 18 seldepth 25 score cp 40 lowerbound nodes 3 pv e2e4')).toEqual({
      rank: 1,
      depth: 18,
      nodes: 3,
      score: { kind: 'cp', value: 40 },
      move: 'e2e4',
      bound: true,
    });
    expect(parseInfo('info depth 18 currmove e2e4 currmovenumber 1')).toBe(undefined);
    expect(parseInfo('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBe(undefined);
    expect(parseInfo('bestmove e2e4 ponder e7e5')).toBe(undefined);
  });
});

describe('isWholeDepth', () => {
  /** The sets `lines` print, each checked as a search of three ranks limited to `nodes`. */
  const sets = (lines: string[], nodes: number) => {
    const found: { moves: string[]; whole: boolean }[] = [];
    let printing: readonly SearchLine[] = [];
    for (const line of lines) {
      printing = addLine(printing, parseInfo(line)!);
      if (printing.length === 1) found.push({ moves: [], whole: false });
      found.at(-1)!.moves = printing.map(({ move }) => move!);
      found.at(-1)!.whole = isWholeDepth(printing, 3, nodes);
    }
    return found;
  };

  it('passes the depths a search finished, and fails the set printed where it stopped', () => {
    // The last three depths Stockfish printed for 1.d4 d5 2.c4 c6 3.Nc3 Nf6
    // 4.Bf4 Bf5 5.e3 e6 6.Qb3 Qb6 (lesson position L1), each limit's last
    // print a set that stopped short of its depth.
    expect(
      sets(
        [
          'info depth 13 multipv 1 score cp 39 nodes 181189 pv c4d5',
          'info depth 13 multipv 2 score cp 32 nodes 181189 pv g1f3',
          'info depth 13 multipv 3 score cp 25 nodes 181189 pv h2h3',
          // At 300,000 positions: two lines of depth 14, and the third still depth 13's.
          'info depth 14 multipv 1 score cp 47 nodes 300044 pv c4d5',
          'info depth 14 multipv 2 score cp 29 nodes 300044 pv g1f3',
          'info depth 13 multipv 3 score cp 25 nodes 300044 pv h2h3',
        ],
        300_000,
      ),
    ).toEqual([
      { moves: ['c4d5', 'g1f3', 'h2h3'], whole: true },
      { moves: ['c4d5', 'g1f3', 'h2h3'], whole: false },
    ]);
    expect(
      sets(
        [
          'info depth 18 multipv 1 score cp 32 nodes 984649 pv g1f3',
          'info depth 18 multipv 2 score cp 30 nodes 984649 pv c4d5',
          'info depth 18 multipv 3 score cp 30 nodes 984649 pv a1c1',
          // At 1,000,000: depth 18's lines again, under depth 19's number.
          'info depth 19 multipv 1 score cp 32 nodes 1000072 pv g1f3',
          'info depth 19 multipv 2 score cp 30 nodes 1000072 pv c4d5',
          'info depth 19 multipv 3 score cp 30 nodes 1000072 pv a1c1',
        ],
        1_000_000,
      ).map(({ whole }) => whole),
    ).toEqual([true, false]);
  });

  it('fails a set with a bound, and one still being printed', () => {
    expect(
      sets(
        [
          'info depth 17 multipv 1 score cp -3 nodes 900512 pv h2h3',
          'info depth 17 multipv 2 score cp -5 lowerbound nodes 900512 pv f3e5',
          'info depth 17 multipv 3 score cp -26 nodes 900512 pv c2c3',
          'info depth 18 multipv 1 score cp -3 nodes 950512 pv h2h3',
          'info depth 18 multipv 2 score cp -5 nodes 950512 pv f3e5',
        ],
        1_000_000,
      ).map(({ whole }) => whole),
    ).toEqual([false, false]);
  });

  it('takes fewer lines where fewer moves are legal', () => {
    const line = parseInfo('info depth 245 multipv 1 score mate -1 nodes 30 pv e8d8')!;
    expect(isWholeDepth([line], 1, 1_000_000)).toBe(true);
    expect(isWholeDepth([line], 3, 1_000_000)).toBe(false);
  });
});

describe('multiPvCommand', () => {
  it('sets how many moves a search ranks', () => {
    expect(multiPvCommand(3)).toBe('setoption name MultiPV value 3');
  });
});

describe('forwardNeededLines', () => {
  it("passes on the handshake, each search's lines from depth 10, and its end", () => {
    const passed: string[] = [];
    const pass = forwardNeededLines((line) => passed.push(line));
    for (const line of [
      'id name Stockfish 19',
      'uciok',
      'info depth 9 multipv 1 score cp 10 nodes 2000 pv e2e4',
      'info depth 10 currmove e2e4 currmovenumber 1',
      'info depth 10 multipv 1 score cp 30 nodes 4000 pv e2e4',
      'info depth 10 multipv 2 score cp 20 nodes 4000 pv d2d4',
      'info string NNUE evaluation using nn-61e7af4bb97d.nnue',
      'bestmove e2e4 ponder e7e5',
    ])
      pass(line);
    expect(passed).toEqual([
      'uciok',
      'info depth 10 multipv 1 score cp 30 nodes 4000 pv e2e4',
      'info depth 10 multipv 2 score cp 20 nodes 4000 pv d2d4',
      'bestmove e2e4 ponder e7e5',
    ]);
  });

  it('passes on the last set of a search that ends before depth 10', () => {
    const passed: string[] = [];
    const pass = forwardNeededLines((line) => passed.push(line));
    for (const line of [
      'info depth 1 multipv 1 score mate 1 nodes 20 pv d8h4',
      'info depth 2 multipv 1 score mate 1 nodes 40 pv d8h4',
      'info depth 2 multipv 2 score cp -30 nodes 40 pv e7e5',
      'bestmove d8h4',
      'info depth 1 multipv 1 score cp 5 nodes 20 pv e7e5',
      'bestmove e7e5',
    ])
      pass(line);
    expect(passed).toEqual([
      'info depth 2 multipv 1 score mate 1 nodes 40 pv d8h4',
      'info depth 2 multipv 2 score cp -30 nodes 40 pv e7e5',
      'bestmove d8h4',
      // The next search starts with nothing left over.
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
