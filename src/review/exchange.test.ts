import { describe, expect, it } from '@jest/globals';
import type { NormalMove } from 'chessops/types';
import { parseSquare, parseUci } from 'chessops/util';

import { parsePosition } from '@/game/replay';

import { exchangeGain, hanging, materialGivenUp, winsMaterial } from './exchange';

const at = (fen: string) => parsePosition(fen)!;
const square = (name: string) => parseSquare(name)!;
const move = (uci: string) => parseUci(uci) as NormalMove;

describe('materialGivenUp', () => {
  it('counts a bishop given for a pawn, taken by the king', () => {
    // The Greek gift: Bxh7+ Kxh7.
    const before = at('r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 1');
    expect(materialGivenUp(before, move('d3h7'))).toBe(2);
  });

  it("doesn't count a piece the only capturer can't take, being pinned", () => {
    // Bb5 pins the knight on d7 to its king, so Ne5 is safe.
    expect(materialGivenUp(at('4k3/3n4/8/1B6/8/5N2/8/4K3 w - - 0 1'), move('f3e5'))).toBe(0);
    expect(materialGivenUp(at('4k3/3n4/8/8/8/5N2/8/4K3 w - - 0 1'), move('f3e5'))).toBe(3);
  });

  it("doesn't count a piece that was lost anyway and takes something first", () => {
    // The pawn on d6 attacks the knight, which takes on f7 on its way out.
    expect(materialGivenUp(at('4k3/5p2/3p4/4N3/8/8/8/4K3 w - - 0 1'), move('e5f7'))).toBe(0);
    expect(materialGivenUp(at('4k3/5p2/8/4N3/8/8/8/4K3 w - - 0 1'), move('e5f7'))).toBe(2);
  });

  it('counts only what a piece already losing a trade gives up beyond it', () => {
    // The knight, which the pawn on d6 wins for a pawn, takes on f7 and is lost for one.
    expect(materialGivenUp(at('4k3/5p2/3p4/4N3/3P4/8/8/4K3 w - - 0 1'), move('e5f7'))).toBe(0);
  });

  it('counts a piece left to be taken, even with another already hanging', () => {
    // The rook on a5 hangs to the pawn on b6 already; Nd4-c6?? hangs the knight to the pawn on b7 too.
    expect(materialGivenUp(at('4k3/1p6/1p6/R7/3N4/8/8/4K3 w - - 0 1'), move('d4c6'))).toBe(3);
  });

  it('counts a pawn that promotes where it is taken as only a pawn', () => {
    expect(materialGivenUp(at('r3k3/1P6/8/8/8/8/8/4K3 w - - 0 1'), move('b7b8q'))).toBe(1);
  });

  it("doesn't count a defended piece the opponent would lose more to take", () => {
    // Taking the knight on e5 with the rook loses the rook to the pawn on d4.
    expect(materialGivenUp(at('4k3/4r3/8/8/3P4/5N2/8/6K1 w - - 0 1'), move('f3e5'))).toBe(0);
  });
});

describe('exchangeGain', () => {
  it('counts a pawn that captures onto its last rank as a queen, taken back', () => {
    // bxa8=Q wins the rook and makes a queen (13), then the bishop takes the queen (9).
    expect(exchangeGain(at('r3k3/1P6/8/8/8/8/8/4K2b w - - 0 1'), square('a8'))).toBe(4);
  });

  it('is 0 for an empty square or one of the side to move', () => {
    const pos = at('4k3/8/8/8/8/8/8/R3K3 w - - 0 1');
    expect(exchangeGain(pos, square('a1'))).toBe(0);
    expect(exchangeGain(pos, square('a5'))).toBe(0);
  });
});

describe('winsMaterial', () => {
  it('holds for a free capture, not for an even trade or a move that takes nothing', () => {
    expect(winsMaterial(at('4k3/8/8/3n4/8/8/8/3RK3 w - - 0 1'), move('d1d5'))).toBe(true);
    // An underpromotion adds material but takes nothing.
    expect(winsMaterial(at('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1'), move('b7b8n'))).toBe(false);
    expect(winsMaterial(at('4k3/8/4p3/3n4/8/2N5/8/4K3 w - - 0 1'), move('c3d5'))).toBe(false);
  });
});

describe('hanging', () => {
  it('holds for a piece the opponent would win by taking', () => {
    const pos = at('4k3/8/3p4/4N3/8/8/8/4K3 w - - 0 1');
    expect(hanging(pos, square('e5'))).toBe(true);
    expect(hanging(at('4k3/8/8/4N3/8/8/8/4K3 w - - 0 1'), square('e5'))).toBe(false);
  });
});
