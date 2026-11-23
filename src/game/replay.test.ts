import { describe, expect, it } from '@jest/globals';

import { Chess } from 'chessops/chess';
import { INITIAL_FEN } from 'chessops/fen';
import type { NormalMove } from 'chessops/types';
import { parseUci } from 'chessops/util';

import {
  shownMove,
  analyze,
  dropMove,
  fenAfter,
  lastPosition,
  legalMoveCount,
  legalMoveCountAt,
  lineMove,
  NAMED_MOVE,
  numberedLine,
  numberedMove,
  parsePosition,
  pieceAt,
  playMove,
  positionKey,
  replay,
  takenRole,
  toUci,
} from './replay';

describe('NAMED_MOVE', () => {
  // Each match as [number, `..` after it, `...` with no number, SAN].
  const read = (text: string) =>
    [...text.matchAll(new RegExp(NAMED_MOVE, 'g'))].map(([, number, dots, bare, san]) => [
      number ?? '',
      dots ?? '',
      bare ?? '',
      san,
    ]);

  it('reads ... right after a move, but no bare move glued to a word or a dot', () => {
    expect(read('Qxd4...Qxd4 and 12...Nf6, not Qxd4Nf6 or x5.e4')).toEqual([
      ['', '', '', 'Qxd4'],
      ['', '', '...', 'Qxd4'],
      ['12', '..', '', 'Nf6'],
      ['', '', '', 'Qxd4'],
    ]);
  });
});

describe('numberedMove', () => {
  it('numbers White’s move with a dot and Black’s with the mark given', () => {
    expect(numberedMove('e4', 1)).toBe('1.e4');
    expect(numberedMove('c6', 2)).toBe('1...c6');
    expect(numberedMove('Nc6', 24, '…')).toBe('12…Nc6');
  });
});

describe('numberedLine', () => {
  it('numbers a line from the first move, or from a Black move', () => {
    expect(numberedLine(['e4', 'c6', 'd4'])).toBe('1.e4 c6 2.d4');
    expect(numberedLine(['d5', 'e5'], 4)).toBe('2...d5 3.e5');
  });
});

describe('playMove', () => {
  it('plays a legal move and describes it', () => {
    const pos = Chess.default();
    expect(playMove(pos, 'g1f3')).toEqual({ uci: 'g1f3', san: 'Nf3', from: 'g1', to: 'f3' });
    expect(pos.turn).toBe('black');
  });

  it('plays nothing for an illegal or unreadable move', () => {
    const pos = Chess.default();
    const before = positionKey(pos);
    expect(playMove(pos, 'e2e5')).toBeUndefined();
    expect(playMove(pos, 'nonsense')).toBeUndefined();
    expect(positionKey(pos)).toBe(before);
  });
});

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

describe('legalMoveCountAt', () => {
  it("counts a position's legal moves from its FEN, as legalMoveCount does from the moves", () => {
    // After 3.e5 d5 White can take en passant on d6.
    const line = ['e2e4', 'c7c6', 'e4e5', 'd7d5'];
    const plies = replay(line);
    expect(plies.map(({ fen }) => legalMoveCountAt(fen))).toEqual(
      plies.map((_, n) => legalMoveCount(line.slice(0, n))),
    );
  });
});

describe('fenAfter', () => {
  it('plays a legal move from a position, as the game would', () => {
    const [start, afterE4] = replay(['e2e4']);
    expect(fenAfter(start.fen, 'e2e4')).toBe(afterE4.fen);
  });

  it('plays nothing for a move that is not legal there', () => {
    expect(fenAfter(replay([])[0].fen, 'e2e5')).toBeUndefined();
  });
});

describe('legalMoveCount', () => {
  it('counts each legal move, as many as the start has', () => {
    expect(legalMoveCount([])).toBe(20);
  });

  it('counts none once mated', () => {
    expect(legalMoveCount(['f2f3', 'e7e5', 'g2g4', 'd8h4'])).toBe(0);
  });

  it('counts a promotion as four moves, one per piece', () => {
    // 4...Nbd7: b7 promotes on b8, a8 or c8 (12 moves), beside 29 others.
    expect(legalMoveCount(['e2e4', 'd7d5', 'e4d5', 'c7c6', 'd5c6', 'g8f6', 'c6b7', 'b8d7'])).toBe(
      41,
    );
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

describe('dropMove', () => {
  it('records a drop as the line does: promoting, castling onto the rook, and nothing illegal', () => {
    expect(dropMove('r3k3/1P6/8/8/8/8/8/4K1N1 w - - 0 1', 'b7', 'a8')).toBe('b7a8q');
    const castles = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    expect(dropMove(castles, 'e1', 'h1')).toBe('e1g1');
    expect(dropMove(castles, 'e1', 'g1')).toBe('e1g1');
    expect(dropMove(castles, 'e1', 'e3')).toBeUndefined();
  });
});

describe('shownMove', () => {
  it('names the start, then White’s moves with a dot and Black’s with an ellipsis', () => {
    expect([shownMove(undefined, 0), shownMove('e4', 1), shownMove('c6', 2)]).toEqual([
      'Start',
      '1.e4',
      '1…c6',
    ]);
  });
});

describe('takenRole', () => {
  const taken = (fen: string, uci: string) =>
    takenRole(parsePosition(fen)!, parseUci(uci) as NormalMove);

  it('names the piece a move takes on its square, and none for a quiet move', () => {
    // 1.e4 d5: exd5 takes a pawn; Nf3 takes nothing.
    const fen = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    expect(taken(fen, 'e4d5')).toBe('pawn');
    expect(taken(fen, 'g1f3')).toBeUndefined();
  });

  it('names a pawn for en passant, onto an empty square', () => {
    const fen = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
    expect(taken(fen, 'e5f6')).toBe('pawn');
  });
});
