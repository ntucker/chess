import { describe, expect, it } from '@jest/globals';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import { FULL_LOADER, FULL_WASM, FULL_WASM_BYTES } from './fullFiles';

describe('full Stockfish files', () => {
  it('names the files `yarn stockfish` copies, and the size the download is checked against', () => {
    const bin = join(require.resolve('stockfish/package.json'), '..', 'bin');
    expect(statSync(join(bin, FULL_WASM)).size).toBe(FULL_WASM_BYTES);
    expect(statSync(join(bin, FULL_LOADER)).isFile()).toBe(true);
  });
});
