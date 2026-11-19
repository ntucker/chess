import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PHONE_LENGTHS, PHONE_PARTS, phoneLength } from './phone';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./phone.css', () => ({}));

describe('phone.css', () => {
  // The phone rules sit inside the phone-width media query.
  const css = readFileSync(join(__dirname, 'phone.css'), 'utf8');
  const start = css.indexOf('@media (max-width:');
  const phone = css.slice(start);

  it('has the media query', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it.each(PHONE_LENGTHS)('sets --%s', (name) => {
    expect(phone).toMatch(new RegExp(`--${name}: `));
  });

  it.each(PHONE_PARTS)('lays out the %s', (part) => {
    expect(phone).toContain(`[data-phone='${part}']`);
  });

  it('gives the panel a floor, so the page scrolls rather than squeeze it to nothing', () => {
    const program = phone.slice(phone.indexOf("[data-phone='program']"));
    expect(program).toMatch(/min-height: [1-9]\d*px;/);
    expect(phone).toMatch(/\[data-phone='page'\] \{\s*min-height: 100dvh;/);
  });
});

describe('phoneLength', () => {
  it('works out the wide value and the CSS from one expression', () => {
    const offset = phoneLength('player-bar-height', 60).plus(4);
    const sum = phoneLength('page-space', 20).times(3).minus(offset);
    expect(sum.wide).toBe(60 - 64);
    expect(sum.css).toBe(
      '((var(--page-space, 20px) * 3) - (var(--player-bar-height, 60px) + 4px))',
    );
  });

  it('adds lengths, and off the web its style value is the wide number', () => {
    const sum = phoneLength('page-space', 20).plus(phoneLength('header-height', 40));
    expect(sum.wide).toBe(60);
    expect(sum.css).toBe('(var(--page-space, 20px) + var(--header-height, 40px))');
    // Jest builds the native code (EXPO_OS is inlined at build time).
    expect(sum.value).toBe(60);
  });
});
