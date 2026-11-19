import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PHONE_LENGTHS, PHONE_PARTS, phoneLength } from './phone';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./phone.css', () => ({}));

describe('phone.css', () => {
  const css = readFileSync(join(__dirname, 'phone.css'), 'utf8');

  it.each([...PHONE_LENGTHS, 'wide-only'])('sets --%s', (name) => {
    expect(css).toMatch(new RegExp(`--${name}:`));
  });

  it.each(PHONE_PARTS)('lays out the %s', (part) => {
    expect(css).toContain(`[data-phone='${part}']`);
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
    // Jest runs as native unless EXPO_OS says web.
    expect(sum.value).toBe(process.env.EXPO_OS === 'web' ? `calc(${sum.css})` : 60);
  });
});
