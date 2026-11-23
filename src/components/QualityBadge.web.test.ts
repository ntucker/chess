import { describe, expect, it } from '@jest/globals';

import { verdictText } from './QualityBadge';

describe('verdictText', () => {
  it('says the label and the change for the learner', () => {
    expect(
      verdictText({
        quality: 'mistake',
        change: { label: '\u22121.6', description: '1.6 pawns worse for you' },
      }),
    ).toBe('Stockfish: Mistake, 1.6 pawns worse for you');
    expect(
      verdictText({
        quality: 'mistake',
        change: { label: '+M2', description: 'You mate in 2' },
      }),
    ).toBe('Stockfish: Mistake, you mate in 2');
  });

  it('says only the label of a move that changes nothing', () => {
    expect(
      verdictText({ quality: 'best', change: { label: '0.0', description: 'No change' } }),
    ).toBe('Stockfish: Best move');
  });
});
