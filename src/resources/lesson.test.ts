import { describe, expect, it } from '@jest/globals';
import { readdirSync } from 'node:fs';

import { checkLesson } from '@/lesson/check';
import { LESSON_FOLDER, readShippedLesson } from '@/lesson/lesson.fixture';
import { indexEntry } from '@/lesson/openings';

import { LESSON_INDEX, LESSONS } from './lesson';

const ids = readdirSync(LESSON_FOLDER)
  .filter((file) => file.endsWith('.json') && file !== 'index.json')
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

  it.each(ids)('%s is in the index as its file says', (id) => {
    expect(LESSON_INDEX[id as keyof typeof LESSON_INDEX]).toEqual(indexEntry(readShippedLesson(id)));
  });

  it('teaches one side, since the start position takes its side from the first lesson', () => {
    expect(new Set(Object.values(LESSON_INDEX).map(({ side }) => side)).size).toBe(1);
  });

  it('gives each first move to one lesson, so the start position can pick it', () => {
    const firstMoves = Object.values(LESSON_INDEX).flatMap((entry) => entry.firstMoves);
    expect(new Set(firstMoves).size).toBe(firstMoves.length);
  });
});
