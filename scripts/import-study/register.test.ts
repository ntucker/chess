import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SAMPLE } from '@/lesson/lesson.fixture';

import { indexLesson, registerLesson } from './register';

const tempFile = (name: string) => join(mkdtempSync(join(tmpdir(), 'register-')), name);

describe('registerLesson', () => {
  it('adds a lesson to LESSONS once', () => {
    const file = tempFile('lesson.ts');
    writeFileSync(
      file,
      "export const LESSONS = {\n  'a': () => import('@/assets/lessons/a.json'),\n};\n",
    );
    registerLesson(file, 'b');
    registerLesson(file, 'b');
    expect(readFileSync(file, 'utf8')).toBe(
      "export const LESSONS = {\n  'a': () => import('@/assets/lessons/a.json'),\n  'b': () => import('@/assets/lessons/b.json'),\n};\n",
    );
  });
});

describe('indexLesson', () => {
  it("writes the lesson's entry, keeping the other lessons'", () => {
    const file = tempFile('index.json');
    const other = {
      title: 'Slav Defence',
      side: 'black',
      source: SAMPLE.source,
      firstMoves: ['d2d4'],
    };
    writeFileSync(file, JSON.stringify({ slav: other }));
    indexLesson(file, SAMPLE);
    indexLesson(file, SAMPLE);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      slav: other,
      [SAMPLE.id]: {
        title: SAMPLE.title,
        side: 'black',
        source: SAMPLE.source,
        firstMoves: ['e2e4'],
      },
    });
  });
});
