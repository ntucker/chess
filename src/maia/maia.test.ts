/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SquareSet } from 'chessops/squareSet';
import { makeUci } from 'chessops/util';

import { bestMove, evaluation, JUDGE_RATING, moveShares, prepareInput } from './maia';
import { forward, type MaiaNetwork, parseNetwork } from './network';
import { POLICY_SLOTS, policySlot } from './policy';
import REFERENCE from './reference-moves.json';

const load = (rating: number) =>
  parseNetwork(readFileSync(join(__dirname, `../../assets/maia/maia-${rating}.bin`)));
const networks = new Map([1100, 1900].map((rating) => [rating, load(rating)]));
const maia1100 = networks.get(1100)!;

const prepare = (line: string) => prepareInput(line ? line.split(' ') : []);
const think = (network: MaiaNetwork, line: string) => {
  const prepared = prepare(line);
  return { ...prepared, ...forward(network, prepared.planes) };
};
const play = (line: string) => {
  const { pos, policy } = think(maia1100, line);
  return bestMove(pos, policy);
};

describe('policy', () => {
  it('names the 1858 moves lc0 scores, each in its own output slot', () => {
    expect(POLICY_SLOTS.size).toBe(1858);
    expect(new Set(POLICY_SLOTS.values()).size).toBe(1858);
    expect(Math.max(...POLICY_SLOTS.values())).toBeLessThan(80 * 64);
  });

  it('mirrors Black moves and writes knight promotions as plain moves', () => {
    const e2 = 12,
      e4 = 28,
      e5 = 36,
      e7 = 52,
      a7 = 48,
      a8 = 56;
    expect(policySlot({ from: e7, to: e5 }, true)).toBe(policySlot({ from: e2, to: e4 }, false));
    expect(policySlot({ from: a7, to: a8, promotion: 'knight' }, false)).toBe(
      POLICY_SLOTS.get('a7a8'),
    );
    expect(policySlot({ from: a7, to: a8, promotion: 'queen' }, false)).toBe(
      POLICY_SLOTS.get('a7a8q'),
    );
  });
});

describe('bestMove', () => {
  it('opens 1. e4, as the Maia 1100 model does', () => {
    expect(play('')).toBe('e2e4');
  });

  it('answers as Black', () => {
    expect(play('e2e4')).toBe('e7e5');
  });

  // Moves the reference implementation of the network picks.
  it.each([
    ['d2d4 d7d5 c2c4 c7c6 b1c3 g8f6 e2e3 e7e6 g1f3 b8d7 f1d3 f8e7', 'e1h1'],
    ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 b8c6 c1g5 e7e6 d1d2 a7a6', 'e1a1'],
    ['d2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 f2f3', 'e8h8'],
  ])('castles as the king taking its rook after %s', (line, move) => {
    expect(play(line)).toBe(move);
  });

  // reference-moves.json: positions from lichess's openings list, then
  // random games stopped where a pawn can promote, with the move a separate
  // NumPy implementation of the network (using lc0's own move tables) picks.
  // For promotions it also gives the promotion that implementation rates
  // highest, which checks the promotion slots even when another move wins.
  // A failure means the engine broke, unless scripts/convert-maia.mjs changed
  // and the two best moves score almost the same: that implementation reads
  // the original weights, which the app's 16-bit copies can tip in a near tie.
  // For networks with a value head it also gives the win, draw and loss
  // chances, rounded to 4 places, which must match to within 0.0005.
  it.each(REFERENCE)('Maia $rating after "$line" plays $move', ({ rating, line, ...want }) => {
    const { pos, policy, wdl } = think(networks.get(rating)!, line);
    expect(bestMove(pos, policy)).toBe(want.move);
    want.wdl?.forEach((chance, i) => expect(wdl?.[i]).toBeCloseTo(chance, 3));
    if ('bestPromotion' in want) {
      let best = { uci: '', score: -Infinity };
      for (const [from, dests] of pos.allDests()) {
        if (!pos.board.pawn.has(from)) continue;
        for (const to of dests.intersect(SquareSet.backranks())) {
          for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as const) {
            const score = policy[policySlot({ from, to, promotion }, pos.turn === 'black')!];
            if (score > best.score) best = { uci: makeUci({ from, to, promotion }), score };
          }
        }
      }
      expect(best.uci).toBe(want.bestPromotion);
    }
  });

  it('rejects an illegal line', () => {
    expect(() => play('e2e5')).toThrow('Illegal move e2e5');
  });
});

describe('moveShares', () => {
  const shares = (line: string) => {
    const { pos, policy } = think(maia1100, line);
    return { pos, policy, shares: moveShares(pos, policy) };
  };

  it('gives every legal move a share, adding up to 1', () => {
    const { shares: atStart } = shares('');
    expect(Object.keys(atStart)).toHaveLength(20);
    expect(Object.values(atStart).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 6);
  });

  it('gives the move Maia plays the largest share', () => {
    const { pos, policy, shares: after } = shares('e2e4');
    const most = Object.entries(after).reduce((a, b) => (b[1] > a[1] ? b : a));
    expect(most[0]).toBe(bestMove(pos, policy));
  });

  it('names a castle as the game records it, the king moving two squares', () => {
    const line = 'd2d4 d7d5 c2c4 c7c6 b1c3 g8f6 e2e3 e7e6 g1f3 b8d7 f1d3 f8e7';
    const { shares: after } = shares(line);
    expect(after).toHaveProperty('e1g1');
    expect(after).not.toHaveProperty('e1h1');
  });
});

describe('evaluation', () => {
  const after = (line: string) => prepare(line).pos;
  const wdl = (win: number, draw: number, loss: number) => new Float32Array([win, draw, loss]);

  it("reads the chances of the side to move as White's", () => {
    expect(evaluation(after(''), wdl(0.6, 0.2, 0.2))).toEqual({
      score: expect.closeTo(0.7, 6),
      pawns: expect.closeTo(0.9 * Math.tan(1.5637541897 * 0.4), 6),
    });
    expect(evaluation(after('e2e4'), wdl(0.6, 0.2, 0.2))).toEqual({
      score: expect.closeTo(0.3, 6),
      pawns: expect.closeTo(-0.9 * Math.tan(1.5637541897 * 0.4), 6),
    });
  });

  it('calls an even position even', () => {
    expect(evaluation(after('e2e4'), wdl(0.3, 0.4, 0.3))).toEqual({ score: 0.5, pawns: 0 });
  });

  it('comes from a network with a value head', () => {
    expect(think(load(JUDGE_RATING), '').wdl).toHaveLength(3);
    expect(think(maia1100, '').wdl).toBeUndefined();
  });
});
