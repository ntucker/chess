import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SAMPLE } from '@/lesson/lesson.fixture';
import { indexEntry } from '@/lesson/openings';
import { LESSONS } from '@/resources/lesson';

import { indexLesson, registerLesson } from './register';

const tempFile = (name: string) => join(mkdtempSync(join(tmpdir(), 'register-')), name);

describe('registerLesson', () => {
  it('adds a lesson to LESSONS once, quoting its key only when Prettier would', () => {
    const file = tempFile('lesson.ts');
    writeFileSync(
      file,
      "export const LESSONS = {\n  a: () => import('@/assets/lessons/a.json'),\n};\n",
    );
    for (const id of ['b', 'c-d', 'b', 'c-d']) registerLesson(file, id);
    expect(readFileSync(file, 'utf8')).toBe(
      "export const LESSONS = {\n  a: () => import('@/assets/lessons/a.json'),\n  b: () => import('@/assets/lessons/b.json'),\n  'c-d': () => import('@/assets/lessons/c-d.json'),\n};\n",
    );
  });

  it('finds every lesson already in the formatted registry', () => {
    const file = tempFile('lesson.ts');
    const source = readFileSync(join(__dirname, '../../src/resources/lesson.ts'), 'utf8');
    writeFileSync(file, source);
    for (const id of Object.keys(LESSONS)) registerLesson(file, id);
    expect(readFileSync(file, 'utf8')).toBe(source);
  });
});

describe('indexLesson', () => {
  it("writes the lesson's entry, keeping the other lessons'", () => {
    const file = tempFile('index.json');
    const other = {
      title: 'Slav Defence',
      side: 'black',
      sources: SAMPLE.sources,
      firstMoves: ['d2d4'],
      lineEnds: { d2d4: [] },
    };
    writeFileSync(file, JSON.stringify({ slav: other }));
    indexLesson(file, SAMPLE);
    indexLesson(file, SAMPLE);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      slav: other,
      [SAMPLE.id]: indexEntry(SAMPLE),
    });
  });
});
