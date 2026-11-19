import { describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PHONE_LENGTHS, phoneLength } from './phone';

// Jest can't load a stylesheet; this test reads it as text instead.
jest.mock('./phone.css', () => ({}));

describe('phone.css', () => {
  const css = readFileSync(join(__dirname, 'phone.css'), 'utf8');

  it.each([...PHONE_LENGTHS, 'wide-only'])('sets --%s', (name) => {
    expect(css).toMatch(new RegExp(`--${name}:`));
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
});
