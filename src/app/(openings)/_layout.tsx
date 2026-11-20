import { Slot } from 'expo-router';

import { LessonPage } from '@/components/lesson/LessonScreen';
import { useOpeningsAddress } from '@/components/lesson/useOpeningsAddress';

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
  const { id, variation, entry } = useOpeningsAddress();
  return (
    <>
      <LessonPage id={id} variation={variation} entry={entry} />
      <Slot />
    </>
  );
}
