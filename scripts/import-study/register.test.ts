import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registerLesson } from './register';

describe('registerLesson', () => {
  it('adds a lesson to LESSONS once', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'register-')), 'lesson.ts');
    writeFileSync(file, "export const LESSONS = {\n  'a': () => import('@/assets/lessons/a.json'),\n};\n");
    registerLesson(file, 'b');
    registerLesson(file, 'b');
    expect(readFileSync(file, 'utf8')).toBe(
      "export const LESSONS = {\n  'a': () => import('@/assets/lessons/a.json'),\n  'b': () => import('@/assets/lessons/b.json'),\n};\n",
    );
  });
});
