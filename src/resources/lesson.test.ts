import { describe, expect, it } from '@jest/globals';

import { checkLesson } from '@/lesson/check';
import { readShippedLesson, shippedIds } from '@/lesson/lesson.fixture';
import { lessonIndex, meets } from '@/lesson/openings';

import { LESSON_INDEX, type LessonId, LESSONS } from './lesson';

describe('shipped lessons', () => {
  it('registers every file in assets/lessons', () => {
    expect(Object.keys(LESSONS).sort()).toEqual([...shippedIds].sort());
  });

  it.each(shippedIds)('%s passes the rules checker', (id) => {
    const lesson = readShippedLesson(id);
    expect(lesson.id).toBe(id);
    expect(checkLesson(lesson)).toEqual([]);
  });

  it.each(shippedIds)("%s names no variation after a guide's contents page", (id) => {
    const names = Object.values(readShippedLesson(id).variations).map(({ name }) => name);
    expect(names.filter((name) => /\b(?:index|contents)\b/i.test(name))).toEqual([]);
  });

  it('indexes every lesson as their files say', () => {
    const ids = Object.keys(LESSON_INDEX);
    expect(LESSON_INDEX).toEqual(lessonIndex(ids.map(readShippedLesson)));
  });

  it.each(shippedIds)('%s has a line from the start that picks it', (id) => {
    expect(LESSON_INDEX[id as LessonId].lines.length).toBeGreaterThan(0);
  });

  it("starts no line with another lesson's, so a line picks one lesson", () => {
    const lines = Object.entries(LESSON_INDEX).flatMap(([id, { side, lines }]) =>
      lines.map(({ moves }) => ({ id, side, moves })),
    );
    for (const a of lines)
      for (const b of lines)
        if (a !== b && a.side === b.side)
          expect({ a, b, meets: meets(a.moves, b.moves) }).toMatchObject({ meets: false });
  });
});
