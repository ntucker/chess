import { Slot, useLocalSearchParams } from 'expo-router';

import { LessonPage } from '@/components/lesson/LessonScreen';
import { useHistoryEntry } from '@/components/lesson/useHistoryEntry';

/**
 * The openings page, held here so it stays the same page at both of its
 * addresses: `/`, the start position, and `/lesson/<id>`, a lesson picked.
 * Picking an opening moves to its address and the browser's Back returns to
 * the start, while the game and the screen's mode carry on. A lesson's
 * address can name a variation to open (`?variation=`, from the opening
 * list). Going Back or Forward resumes the game each history entry had.
 * The routes themselves draw nothing.
 */
export default function OpeningsLayout() {
  // The focused route's, read from this layout's own navigator, so a screen
  // pushed in front (free play) doesn't change it.
  const { id, variation } = useLocalSearchParams<{ id?: string; variation?: string }>();
  const entry = useHistoryEntry();
  return (
    <>
      <LessonPage id={id} variation={variation} entry={entry} />
      <Slot />
    </>
  );
}
