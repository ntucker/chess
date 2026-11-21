/**
 * Variations that teach nothing, taken out of the lesson. A chapter names
 * the positions on its line even where an earlier source books another move
 * and explains its own: the London's "London vs Benoni" chapter plays 3.c3,
 * which the lesson doesn't recommend, and names 17 positions with no book
 * move and no note. The opening list would offer "Benoni" and lead to a line
 * with nothing to learn. Each such position takes the variation of the
 * position the lesson reaches it from, as a side line does in `merge`.
 */
import { parsePositionKey, positionKey } from '@/game/replay';
import type { Lesson, LessonPosition, PositionKey, VariationId } from '@/lesson/lesson';
import { teachingVariations } from '@/lesson/check';

import { startOf } from './engineCheck';
import { played } from './study';

/** `lesson` without variations that teach nothing, and the ones it dropped. */
export function withoutEmptyVariations(lesson: Lesson): {
  lesson: Lesson;
  dropped: VariationId[];
} {
  const kept = teachingVariations(lesson);
  const dropped = Object.keys(lesson.variations).filter((id) => !kept.has(id));
  if (dropped.length === 0) return { lesson, dropped };
  return {
    lesson: {
      ...lesson,
      variations: Object.fromEntries(
        Object.entries(lesson.variations).filter(([id]) => kept.has(id)),
      ),
      positions: renamed(lesson, kept),
    },
    dropped,
  };
}

/**
 * `lesson.positions` with each one in a variation not `kept` moved to the
 * variation of the position the lesson first reaches it from, the start
 * staying in the opening's own.
 */
function renamed(lesson: Lesson, kept: ReadonlySet<VariationId>): Lesson['positions'] {
  const start = startOf(lesson);
  const startKey = positionKey(start);
  const root = Object.keys(lesson.variations).find((id) => !lesson.variations[id].parent)!;
  const named = new Map<PositionKey, VariationId>();
  const name = (key: PositionKey, from: VariationId) => {
    const own = lesson.positions[key].variation;
    named.set(key, kept.has(own) ? own : from);
  };
  name(startKey, root);
  const queue = [startKey];
  for (let key = queue.shift(); key !== undefined; key = queue.shift()) {
    const pos = parsePositionKey(key)!;
    for (const { uci } of lesson.positions[key].moves) {
      const after = positionKey(played(pos, uci));
      if (named.has(after) || !(after in lesson.positions)) continue;
      name(after, named.get(key)!);
      queue.push(after);
    }
  }
  return Object.fromEntries(
    Object.entries(lesson.positions).map(([key, position]): [PositionKey, LessonPosition] => {
      const variation = named.get(key) ?? position.variation;
      return [key, variation === position.variation ? position : { ...position, variation }];
    }),
  );
}
