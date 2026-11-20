import { Slot, useLocalSearchParams } from 'expo-router';

import { LessonPage } from '@/components/lesson/LessonScreen';

/**
 * The openings page, held here so it stays the same page at both of its
 * addresses: `/`, the start position, and `/lesson/<id>`, a lesson picked.
 * Picking an opening moves to its address and the browser's Back returns to
 * the start, while the game and the screen's mode carry on. The routes
 * themselves draw nothing.
 */
export default function OpeningsLayout() {
  // The focused route's, read from this layout's own navigator, so a screen
  // pushed in front (free play) doesn't change it.
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <>
      <LessonPage id={id} />
      <Slot />
    </>
  );
}
