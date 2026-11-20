import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SAMPLE } from '@/lesson/lesson.fixture';
import { lessonIndex } from '@/lesson/openings';
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
  it('adds the lesson, rewriting the others from their files beside the index', () => {
    const file = tempFile('index.json');
    const other = { ...SAMPLE, id: 'other', title: 'Other', side: 'white' as const };
    writeFileSync(join(dirname(file), 'other.json'), JSON.stringify(other));
    writeFileSync(file, JSON.stringify({ other: {} }));
    indexLesson(file, SAMPLE);
    indexLesson(file, SAMPLE);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(lessonIndex([other, SAMPLE]));
  });
});
