import { describe, expect, it } from '@jest/globals';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { NAMED_MOVE, parsePosition, positionKey } from '@/game/replay';
import { checkLesson } from '@/lesson/check';
import type { Lesson } from '@/lesson/lesson';
import { readShippedLesson, shippedIds } from '@/lesson/lesson.fixture';
import { markedMoves, markId } from '@/lesson/mistakes';
import { lessonIndex, meets } from '@/lesson/openings';

import { LESSON_INDEX, type LessonId, LESSONS } from './lesson';

/** The moves played on some line from the lesson's start to each position, in SAN without check marks. */
function playedBefore(lesson: Lesson): Map<string, Set<string>> {
  const start = parsePosition(lesson.start)!;
  const played = new Map([[positionKey(start), new Set<string>()]]);
  const queue = [start];
  for (let pos = queue.shift(); pos; pos = queue.shift()) {
    const before = played.get(positionKey(pos))!;
    for (const { uci } of lesson.positions[positionKey(pos)]?.moves ?? []) {
      const next = pos.clone();
      const move = parseUci(uci)!;
      const san = makeSan(next, move).replace(/[+#]$/, '');
      next.play(move);
      const key = positionKey(next);
      const known = played.get(key) ?? new Set<string>();
      const size = played.has(key) ? known.size : -1;
      for (const at of [...before, san]) known.add(at);
      played.set(key, known);
      if (known.size !== size) queue.push(next);
    }
  }
  return played;
}

describe('shipped lessons', () => {
  it('registers every file in assets/lessons', () => {
    expect(Object.keys(LESSONS).sort()).toEqual([...shippedIds].sort());
  });

  it.each(shippedIds)('%s passes the rules checker', (id) => {
    const lesson = readShippedLesson(id);
    expect(lesson.id).toBe(id);
    expect(checkLesson(lesson)).toEqual([]);
  });

  it.each(shippedIds)('%s measures every trap: its cost and its gain in each band', (id) => {
    // The importer's opportunities step measures every mark, a study's trap or a find (piece D3).
    const lesson = readShippedLesson(id);
    const unmeasured = markedMoves(lesson)
      .filter(({ move: { mistake } }) => mistake.cost === undefined || !mistake.gain)
      .map(({ key, move }) => markId(key, move.uci));
    expect(unmeasured).toEqual([]);
  });

  it.each(shippedIds)("%s names no variation after a guide's contents page", (id) => {
    const names = Object.values(readShippedLesson(id).variations).map(({ name }) => name);
    expect(names.filter((name) => /\b(?:index|contents)\b/i.test(name))).toEqual([]);
  });

  it.each(shippedIds)('%s names no position after a move not yet played on the way there', (id) => {
    // "Early ...Bf5" waits for ...Bf5; a name giving several moves ("4.h4 & 4.g4") needs one of them.
    const lesson = readShippedLesson(id);
    const moves = (name: string) =>
      [...name.matchAll(new RegExp(NAMED_MOVE, 'g'))].map(([, , , , san]) =>
        san.replace(/[+#]$/, ''),
      );
    const early = [...playedBefore(lesson)].flatMap(([key, played]) => {
      const names: string[] = [];
      for (
        let at: string | undefined = lesson.positions[key]?.variation;
        at;
        at = lesson.variations[at].parent
      )
        names.push(lesson.variations[at].name);
      return names
        .filter((name) => {
          const named = moves(name);
          return named.length > 0 && !named.some((san) => played.has(san));
        })
        .map((name) => `${key}: ${name}`);
    });
    expect(early).toEqual([]);
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
