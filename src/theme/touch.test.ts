import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { negated, TOUCH_TARGET, touchLine, touchPadding, touchTarget } from './touch';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./touch.css', () => ({}));

describe('touch.css', () => {
  const css = readFileSync(join(__dirname, 'touch.css'), 'utf8');

  it('sets the touch target to its native pixels, for a finger only', () => {
    expect(css).toMatch(
      new RegExp(
        `@media \\(pointer: coarse\\) \\{\\s*:root \\{\\s*--touch-target: ${TOUCH_TARGET}px;`,
      ),
    );
  });

  it("keeps a phone browser's own touch effects off the page", () => {
    expect(css).toMatch(/:root \{\s*-webkit-tap-highlight-color: transparent;/);
    expect(css).toMatch(
      /@media \(pointer: coarse\) \{\s*\[data-narrow='board-column'\] \{[^}]*\buser-select: none;[^}]*-webkit-touch-callout: none;/,
    );
    expect(css).toMatch(/html,\s*body \{\s*overscroll-behavior-y: contain;/);
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

  it('make a line of text a finger tall by its least height, centering the text', () => {
    // Padding worked out for the text's own size would squeeze it once Android enlarges it.
    expect(touchLine(20)).toEqual({ minHeight: 48, textAlignVertical: 'center' });
  });

  it('negate a padding, for a margin that undoes it', () => {
    expect(negated(touchPadding(25, 4))).toBe(-11.5);
  });
});
