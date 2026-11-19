import { describe, expect, it } from '@jest/globals';
import { readdirSync } from 'node:fs';

import { checkLesson } from '@/lesson/check';
import { LESSON_FOLDER, readShippedLesson } from '@/lesson/lesson.fixture';

import { LESSONS } from './lesson';

const ids = readdirSync(LESSON_FOLDER)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

describe('shipped lessons', () => {
  it('registers every file in assets/lessons', () => {
    expect(Object.keys(LESSONS).sort()).toEqual(ids.sort());
  });

  it.each(ids)('%s passes the rules checker', (id) => {
    const lesson = readShippedLesson(id);
    expect(lesson.id).toBe(id);
    expect(checkLesson(lesson)).toEqual([]);
  });
});
