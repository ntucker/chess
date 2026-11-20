import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { SAMPLE } from '@/lesson/lesson.fixture';
import { lessonIndex } from '@/lesson/openings';
import { LESSONS } from '@/resources/lesson';

import { indexedWith, registered, writeIndex } from './register';

const tempFile = (name: string) => join(mkdtempSync(join(tmpdir(), 'register-')), name);

describe('registered', () => {
  it('adds a lesson to LESSONS once, quoting its key only when Prettier would', () => {
    let source = "export const LESSONS = {\n  a: () => import('@/assets/lessons/a.json'),\n};\n";
    for (const id of ['b', 'c-d', 'b', 'c-d']) source = registered(source, id);
    expect(source).toBe(
      "export const LESSONS = {\n  a: () => import('@/assets/lessons/a.json'),\n  b: () => import('@/assets/lessons/b.json'),\n  'c-d': () => import('@/assets/lessons/c-d.json'),\n};\n",
    );
  });

  it('finds every lesson already in the formatted registry', () => {
    const source = readFileSync(join(__dirname, '../../src/resources/lesson.ts'), 'utf8');
    expect(Object.keys(LESSONS).reduce(registered, source)).toBe(source);
  });

  it('refuses a file without the registry', () => {
    expect(() => registered('export const OTHER = {};\n', 'b')).toThrow('Could not find LESSONS');
  });
});

describe('indexedWith and writeIndex', () => {
  it('adds the lesson to those its index lists, read from their files beside it', () => {
    const file = tempFile('index.json');
    const other = { ...SAMPLE, id: 'other', title: 'Other', side: 'white' as const };
    writeFileSync(join(dirname(file), 'other.json'), JSON.stringify(other));
    writeFileSync(file, JSON.stringify({ other: {} }));
    writeIndex(file, lessonIndex(indexedWith(file, SAMPLE)));
    // Indexed again, it takes the lesson's place rather than adding it twice.
    expect(indexedWith(file, SAMPLE)).toEqual([other, SAMPLE]);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(lessonIndex([other, SAMPLE]));
  });
});
