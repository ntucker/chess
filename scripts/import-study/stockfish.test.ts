import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { cachedAnalysis, searchedBy } from './stockfish';

describe('cached rows', () => {
  const evaluation = { score: 0.55, pawns: 0.3 };
  const rows = [
    { key: 'unnamed', evaluation: { ...evaluation, best: 'e2e4' } },
    { key: 'check', search: '1x100000', evaluation },
    { key: 'other', search: '3x2000000', evaluation },
  ];

  it("keeps only the rows the check's search filled, counting unnamed ones as its old search", () => {
    const by = (search: string) =>
      rows.filter((row) => searchedBy(row, search)).map((row) => row.key);
    expect(by('1x100000')).toEqual(['unnamed', 'check']);
    expect(by('3x2000000')).toEqual(['other']);
    expect(cachedAnalysis(rows[0]).lines).toEqual([{ uci: 'e2e4', evaluation }]);
  });
});

describe('the Node engine', () => {
  // The importer replaces an engine that stops (./stockfish.ts); the build used to start only once per process.
  it('starts again after one is stopped', () => {
    const output = execFileSync('npx', ['tsx', join(__dirname, 'fixtures/restartEngine.ts')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(output.trim().split('\n')).toEqual(['engine 1: ready', 'engine 2: ready']);
  }, 60_000);
});
