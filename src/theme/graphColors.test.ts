import { describe, expect, it } from '@jest/globals';
import { contrastRatio } from '@reactive/silk-core';

import { graphColors } from './graphColors';

// Silk's checkThemeContrast reads a whole theme; these colors are the same in
// both themes and in none, so their pairs are checked one by one.
const ratio = (a: string, b: string) => contrastRatio(a, b) ?? 0;
const { white, black, edge, scrub, current } = graphColors;

describe('graphColors', () => {
  it('keeps the two areas about 9 to 1 apart', () => {
    expect(ratio(white, black)).toBeGreaterThan(8.5);
  });

  // The dots, the gold line and the scrub line cross both areas: each has a
  // dark edge, which reads on White's area, around a light part, which reads
  // on Black's.
  it('draws the marks that cross both areas in tones that read on each', () => {
    expect(ratio(edge, white)).toBeGreaterThanOrEqual(3);
    expect(ratio(scrub, black)).toBeGreaterThanOrEqual(3);
    expect(ratio(current, black)).toBeGreaterThanOrEqual(3);
  });
});
