import { describe, expect, it } from '@jest/globals';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import sources from '@/assets/fonts/web/sources.json';

import { fonts } from './theme';

const ROOT = join(__dirname, '../..');

describe('the web copies of the fonts (scripts/make-web-fonts.py)', () => {
  it('cover every family', () => {
    expect(Object.keys(sources).sort()).toEqual(Object.values(fonts).sort());
  });

  it.each(Object.entries(sources))(
    '%s was made from its TTF as it is now (else run the script again)',
    (_, { ttf, sha256 }) => {
      const hash = createHash('sha256')
        .update(readFileSync(join(ROOT, ttf)))
        .digest('hex');
      expect(hash).toBe(sha256);
    },
  );
});
