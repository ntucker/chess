/**
 * Variations that teach nothing, taken out of the lesson. A chapter names
 * the positions on its line even where an earlier source books another move
 * and explains its own: the London's "London vs Benoni" chapter plays 3.c3,
 * which the lesson doesn't recommend, and names 17 positions with no book
 * move and no note. The opening list would offer "Benoni" and lead to a line
 * with nothing to learn. Each such position takes the variation of the
 * position the lesson reaches it from, as a side line does in `merge`.
 */
import { teachingVariations } from '@/lesson/check';
import type { Lesson, LessonPosition, PositionKey, VariationId } from '@/lesson/lesson';

import { linesTo } from './engineCheck';

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
 * staying in the opening's own (`merge` gives it the lesson's id).
 */
function renamed(lesson: Lesson, kept: ReadonlySet<VariationId>): Lesson['positions'] {
  const named = new Map<PositionKey, VariationId>();
  // In the order `linesTo` reaches them, so each one's `from` is named first.
  for (const [key, { from }] of linesTo(lesson)) {
    const own = lesson.positions[key]?.variation;
    if (own === undefined) continue;
    named.set(key, kept.has(own) ? own : from === undefined ? lesson.id : named.get(from)!);
  }
  return Object.fromEntries(
    Object.entries(lesson.positions).map(([key, position]): [PositionKey, LessonPosition] => {
      const variation = named.get(key) ?? position.variation;
      return [key, variation === position.variation ? position : { ...position, variation }];
    }),
  );
}
