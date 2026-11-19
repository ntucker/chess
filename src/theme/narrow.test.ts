import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SIDE_BY_SIDE_MIN } from '../components/sideBySide';
import { NARROW_LENGTHS, NARROW_PARTS, narrowLength } from './narrow';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./narrow.css', () => ({}));

describe('narrow.css', () => {
  // The narrow rules sit inside the media query.
  const css = readFileSync(join(__dirname, 'narrow.css'), 'utf8');
  const start = css.indexOf('@media (max-width:');
  const narrow = css.slice(start);

  it('starts the media query just below where the board and panel fit side by side', () => {
    expect(css).toContain(`@media (max-width: ${SIDE_BY_SIDE_MIN - 0.02}px) {`);
  });

  it.each(NARROW_LENGTHS)('sets --%s', (name) => {
    expect(narrow).toMatch(new RegExp(`--${name}: `));
  });

  it.each(NARROW_PARTS)('lays out the %s', (part) => {
    expect(narrow).toContain(`[data-narrow='${part}']`);
  });

  it('gives the panel a floor, so the page scrolls rather than squeeze it to nothing', () => {
    const rule = (part: string) =>
      narrow.match(new RegExp(`\\[data-narrow='${part}'\\] \\{([^}]*)\\}`))?.[1];
    expect(rule('program')).toMatch(/min-height: [1-9]\d*px;/);
    expect(rule('page')).toMatch(/^\s*min-height: 100dvh;\s*$/);
  });
});

describe('narrowLength', () => {
  it('works out the wide value and the CSS from one expression', () => {
    const offset = narrowLength('names-bar-height', 60).plus(4);
    const sum = narrowLength('page-space', 20).times(3).minus(offset);
    expect(sum.wide).toBe(60 - 64);
    expect(sum.css).toBe('((var(--page-space, 20px) * 3) - (var(--names-bar-height, 60px) + 4px))');
  });

  it('adds lengths, and off the web its style value is the wide number', () => {
    const sum = narrowLength('page-space', 20).plus(narrowLength('header-height', 40));
    expect(sum.wide).toBe(60);
    expect(sum.css).toBe('(var(--page-space, 20px) + var(--header-height, 40px))');
    // Jest builds the native code (EXPO_OS is inlined at build time).
    expect(sum.value).toBe(60);
  });
});
