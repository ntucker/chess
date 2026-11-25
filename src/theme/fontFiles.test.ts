import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

import { type FontFamily, fonts } from './theme';

const ROOT = join(__dirname, '../..');
const GOOGLE = join(ROOT, 'node_modules/@expo-google-fonts');

/** Each family's TTF, as fontFiles.ts loads it, and its web copy (scripts/make-web-fonts.py). */
const COPIES: Record<FontFamily, string> = {
  [fonts.display]: join(GOOGLE, 'dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf'),
  [fonts.displayItalic]: join(
    GOOGLE,
    'dm-serif-display/400Regular_Italic/DMSerifDisplay_400Regular_Italic.ttf',
  ),
  [fonts.text]: join(GOOGLE, 'instrument-sans/400Regular/InstrumentSans_400Regular.ttf'),
  [fonts.mono]: join(GOOGLE, 'dm-mono/400Regular/DMMono_400Regular.ttf'),
  [fonts.figurines]: join(ROOT, 'assets/fonts/Figurines.ttf'),
};

/** A TTF's `head` table, whose revision and glyph box change with a new version of the font. */
function ttfHead(file: Buffer): Buffer {
  const tables = file.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const entry = 12 + i * 16;
    if (file.toString('latin1', entry, entry + 4) === 'head') {
      const offset = file.readUInt32BE(entry + 8);
      return file.subarray(offset, offset + file.readUInt32BE(entry + 12));
    }
  }
  throw new Error('No head table');
}

/** The tables WOFF2 names by number (its spec's "known table tags"), up to `loca`. */
const KNOWN = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
];

/** A WOFF2 file's `head` table, from its one Brotli stream of tables. */
function woff2Head(file: Buffer): Buffer {
  let at = 48; // The header's end, where the table directory starts.
  const base128 = () => {
    let value = 0;
    for (;;) {
      const byte = file[at++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
  };
  const entries = [];
  for (let i = file.readUInt16BE(12); i > 0; i--) {
    const flags = file[at++];
    const known = flags & 0x3f;
    const tag = known === 0x3f ? file.toString('latin1', at, (at += 4)) : KNOWN[known];
    const length = base128();
    // glyf and loca are transformed unless version 3; any other table only if not version 0.
    const version = flags >> 6;
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : length });
  }
  const tables = brotliDecompressSync(file.subarray(at, at + file.readUInt32BE(20)));
  let offset = 0;
  for (const { tag, length } of entries) {
    if (tag === 'head') return tables.subarray(offset, offset + length);
    offset += length;
  }
  throw new Error('No head table');
}

/**
 * A `head` table without what a WOFF2 copy writes anew: `checkSumAdjustment`
 * (bytes 8-11), `flags` (16-17, which mark the conversion) and the dates (20-35).
 */
const kept = (head: Buffer) =>
  Buffer.concat([
    head.subarray(0, 8),
    head.subarray(12, 16),
    head.subarray(18, 20),
    head.subarray(36),
  ]);

describe('the web copies of the fonts', () => {
  it.each(Object.entries(COPIES))(
    '%s is its TTF as it is now (else run scripts/make-web-fonts.py)',
    (family, ttf) => {
      const copy = readFileSync(join(ROOT, `assets/fonts/web/${family}.woff2`));
      expect(kept(woff2Head(copy))).toEqual(kept(ttfHead(readFileSync(ttf))));
    },
  );
});
