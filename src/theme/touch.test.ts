import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TOUCH_TARGET, touchPadding, touchTarget } from './touch';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./touch.css', () => ({}));

describe('touch.css', () => {
  it('sets the touch target to its native pixels, for a finger only', () => {
    const css = readFileSync(join(__dirname, 'touch.css'), 'utf8');
    expect(css).toMatch(
      new RegExp(
        `@media \\(pointer: coarse\\) \\{\\s*:root \\{\\s*--touch-target: ${TOUCH_TARGET}px;`,
      ),
    );
  });
});

describe('touch lengths off the web', () => {
  it('are a finger wide', () => {
    expect(touchTarget).toBe(48);
  });

  it('pad what they hold out to a finger, or to the least asked for', () => {
    expect(touchPadding(16)).toBe(16);
    expect(touchPadding(25, 4)).toBe(11.5);
    expect(touchPadding(60, 4)).toBe(4);
  });
});
