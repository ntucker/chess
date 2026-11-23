import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

describe('the Node engine', () => {
  // The importer replaces an engine that stops (./stockfish.ts); the build used to start only once per process.
  it('starts again after one is stopped', () => {
    const output = execFileSync('npx', ['tsx', join(__dirname, 'fixtures/restartEngine.ts')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output.trim().split('\n')).toEqual(['engine 1: ready', 'engine 2: ready']);
  }, 60_000);

  // The opponent check reads every move a ranked search found back from its answers file.
  it('keeps every move of a search ranking several', () => {
    const output = execFileSync('npx', ['tsx', join(__dirname, 'fixtures/rankedCache.ts')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output.trim().split('\n')).toEqual(['rows: 1', 'lines: 3', 'same: true', 'final: true']);
  }, 60_000);
});
