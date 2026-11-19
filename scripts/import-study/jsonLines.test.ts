import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendJsonLine, readJsonLines } from './jsonLines';

describe('readJsonLines', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'json-lines-')), 'cache', 'answers.jsonl');

  it('reads what was appended, and nothing from a missing file', () => {
    const path = file();
    expect(readJsonLines(path)).toEqual([]);
    appendJsonLine(path, { key: 'a', answer: 1 });
    appendJsonLine(path, ['b', 2]);
    expect(readJsonLines(path)).toEqual([{ key: 'a', answer: 1 }, ['b', 2]]);
  });

  it('cuts off a half-written last line, so the next append starts a fresh line', () => {
    const path = file();
    appendJsonLine(path, 1);
    writeFileSync(path, `${readFileSync(path, 'utf8')}{"key":`, { flag: 'w' });
    expect(readJsonLines(path)).toEqual([1]);
    appendJsonLine(path, 2);
    expect(readJsonLines(path)).toEqual([1, 2]);
  });
});
