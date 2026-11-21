/**
 * Variation names no position carries, taken out of the lesson. The merge can
 * leave a chapter's name with no position in it or under it (the London's
 * "Steinitz Countergambit"). A name with positions stays, even where nothing
 * is booked or explained there: the learner can still explore its moves.
 */
import { namedVariations } from '@/lesson/check';
import type { Lesson, VariationId } from '@/lesson/lesson';

/** `lesson` without the variations no position is in or under, and the ones it dropped. */
export function withoutEmptyVariations(lesson: Lesson): {
  lesson: Lesson;
  dropped: VariationId[];
} {
  const kept = namedVariations(lesson);
  const dropped = Object.keys(lesson.variations).filter((id) => !kept.has(id));
  if (dropped.length === 0) return { lesson, dropped };
  const variations = Object.fromEntries(
    Object.entries(lesson.variations).filter(([id]) => kept.has(id)),
  );
  return { lesson: { ...lesson, variations }, dropped };
}
