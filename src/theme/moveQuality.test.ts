import { describe, expect, it } from '@jest/globals';
import { contrastRatio } from '@reactive/silk-core';

import { qualityLooks } from './moveQuality';

describe('qualityLooks', () => {
  // The glyphs are white on the disc, which doesn't change with the theme.
  it.each(Object.entries(qualityLooks))('holds the white glyph at 3:1 on %s', (_, { color }) => {
    expect(contrastRatio(color, '#ffffff') ?? 0).toBeGreaterThanOrEqual(3);
  });
});
