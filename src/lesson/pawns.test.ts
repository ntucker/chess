import { describe, expect, it } from '@jest/globals';
import { parseFen } from 'chessops/fen';
import { makeSquare } from 'chessops/util';

import { spaceSquares } from './pawns';

const board = (fen: string) => parseFen(fen).unwrap().board;
const squares = (fen: string, color: 'white' | 'black') =>
  [...spaceSquares(board(fen), color)].map(makeSquare).sort();

describe('spaceSquares', () => {
  it("counts only the squares a side's pawns attack in the opponent's half", () => {
    // White's d4 attacks c5 and e5 (its own pawn), and e5 attacks d6 and f6.
    // Black's d5 attacks c4 and e4; c6 attacks b5 and d5, which are on
    // Black's own side of the board, so neither counts.
    const fen = 'rnbqkbnr/pp2pppp/2p5/3pP3/3P4/8/PPP2PPP/RNBQKBNR b KQkq - 0 3';
    expect(squares(fen, 'white')).toEqual(['c5', 'd6', 'e5', 'f6']);
    expect(squares(fen, 'black')).toEqual(['c4', 'e4']);
  });

  it('stops at the middle of the board: ranks 5 to 8 for White, 1 to 4 for Black', () => {
    expect(squares('4k3/8/8/8/4p3/8/8/4K3 w - - 0 1', 'black')).toEqual(['d3', 'f3']);
    // e6 attacks d5 and f5, on Black's own side.
    expect(squares('4k3/8/4p3/8/8/8/8/4K3 w - - 0 1', 'black')).toEqual([]);
    // e3 attacks d4 and f4, on White's own side.
    expect(squares('4k3/8/8/8/8/4P3/8/4K3 w - - 0 1', 'white')).toEqual([]);
  });
});
