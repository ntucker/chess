import { describe, expect, it } from '@jest/globals';

import { pawnsLabel, signedEvaluation } from './evaluation';

describe('pawnsLabel', () => {
  it('writes tenths below 10 pawns, whole pawns up to 99', () => {
    expect(pawnsLabel(0.04)).toBe('0.0');
    expect(pawnsLabel(-1.26)).toBe('1.3');
    expect(pawnsLabel(12.4)).toBe('12');
    expect(pawnsLabel(250)).toBe('99');
  });
});

describe('signedEvaluation', () => {
  it("writes White's side with a sign, as engine lines do", () => {
    expect(signedEvaluation({ score: 0.56, pawns: 0.7 })).toBe('+0.7');
    expect(signedEvaluation({ score: 0.4, pawns: -1.2 })).toBe('−1.2');
    expect(signedEvaluation({ score: 0.5, pawns: -0.02 })).toBe('0.0');
    expect(signedEvaluation({ score: 1, pawns: 0, mate: 3 })).toBe('+M3');
    expect(signedEvaluation({ score: 0, pawns: 0, mate: -2 })).toBe('−M2');
    // White to move and already mated: Black won.
    expect(signedEvaluation({ score: 0, pawns: 0, mate: 0 })).toBe('−M0');
  });
});
