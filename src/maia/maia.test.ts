/// <reference types="node" />
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { bestMove, prepareMove } from './maia';
import { parseNetwork, policyLogits } from './network';
import { POLICY_SLOTS, policySlot } from './policy';

const maia1100 = parseNetwork(readFileSync(join(__dirname, '../../assets/maia/maia-1100.bin')));
const play = (line: string) => {
  const { pos, planes } = prepareMove(line ? line.split(' ') : []);
  return bestMove(pos, policyLogits(maia1100, planes));
};

describe('policy', () => {
  it('names the 1858 moves lc0 scores, each in its own output slot', () => {
    expect(POLICY_SLOTS.size).toBe(1858);
    expect(new Set(POLICY_SLOTS.values()).size).toBe(1858);
    expect(Math.max(...POLICY_SLOTS.values())).toBeLessThan(80 * 64);
  });

  it('mirrors Black moves and writes knight promotions as plain moves', () => {
    const e2 = 12, e4 = 28, e5 = 36, e7 = 52, a7 = 48, a8 = 56;
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

  it('rejects an illegal line', () => {
    expect(() => play('e2e5')).toThrow('Illegal move e2e5');
  });
});
