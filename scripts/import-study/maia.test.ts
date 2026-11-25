import { describe, expect, it } from '@jest/globals';

import { maiaReplies } from '@/opportunity/walk';

import { nodeMaiaShares } from './maia';

describe('nodeMaiaShares', () => {
  const shares = nodeMaiaShares(1500);

  it("gives every legal reply a share, adding up to 1, as the finder's replies", () => {
    const after = shares(['e2e4']);
    expect(Object.keys(after)).toHaveLength(20);
    expect(Object.values(after).reduce((sum, share) => sum + share, 0)).toBeCloseTo(1, 5);
    // 1...e5 and 1...c5 are among the most played replies to 1.e4 at any rating.
    expect(after.e7e5).toBeGreaterThan(0.1);
    expect(after.c7c5).toBeGreaterThan(0.1);
    expect(maiaReplies(after)).toEqual({ shares: after, thin: false });
  });

  it("keys a castle as lesson lines write it, the king's two-square move", () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5: White may castle.
    const after = shares(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5']);
    expect(after.e1g1).toBeGreaterThan(0);
    expect(after).not.toHaveProperty('e1h1');
  });
});
