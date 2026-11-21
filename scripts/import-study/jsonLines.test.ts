import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { answersFile, appendJsonLine, readJsonLines } from './jsonLines';

const file = () => join(mkdtempSync(join(tmpdir(), 'json-lines-')), 'cache', 'answers.jsonl');

describe('readJsonLines', () => {
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

describe('answersFile', () => {
  type Row = { key: string; n: number };
  const open = (path: string) =>
    answersFile<Row>(
      path,
      (row) => row.key,
      (row) => row.n >= 0,
    );

  it('keeps new answers at once, and saves only the used ones, sorted by key', () => {
    const path = file();
    for (const key of ['c', 'a', 'stale']) appendJsonLine(path, { key, n: 1 });
    const answers = open(path);
    expect(answers.get('c')).toEqual({ key: 'c', n: 1 });
    expect(answers.get('missing')).toBeUndefined();
    answers.add({ key: 'b', n: 2 });
    expect(open(path).get('b')).toEqual({ key: 'b', n: 2 });
    answers.get('a');
    answers.saveUsed();
    expect(readJsonLines(path)).toEqual([
      { key: 'a', n: 1 },
      { key: 'b', n: 2 },
      { key: 'c', n: 1 },
    ]);
  });

  it('leaves out rows it does not keep', () => {
    const path = file();
    appendJsonLine(path, { key: 'old', n: -1 });
    const answers = open(path);
    expect(answers.get('old')).toBeUndefined();
    answers.saveUsed();
    expect(readJsonLines(path)).toEqual([]);
  });
});
