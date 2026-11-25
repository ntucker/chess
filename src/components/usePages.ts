import { useState } from 'react';

import { haptic } from '@/components/haptics';
import { useCloseKeys } from '@/components/useCloseKeys';

/**
 * Which page shows under the board, of a few side by side (the lesson and
 * its scoresheet): the one owner the move pill, a sideways swipe (a silk
 * `Pager` proposing its page) and Android's back all go through. Away from
 * `home`, Escape and Android's back return there while the screen is in
 * front. While not `shown` (a wide page, which lays the pages out
 * otherwise), the page reads as `home`, so nothing unseen takes Back; the
 * page picked comes back if the pages show again. A page in `missing` (one
 * the screen has nothing for now, such as a lesson's list of opportunities
 * where it marks none) reads as `home` the same way. A page `show` picks
 * ticks on Android; Back doesn't, since the system answers it.
 */
export function usePages<P extends string>(
  home: P,
  shown: boolean,
  missing: readonly P[] = [],
): { readonly page: P; readonly show: (page: P) => void } {
  const [picked, setPicked] = useState<P>(home);
  const page = shown && !missing.includes(picked) ? picked : home;
  useCloseKeys(page === home ? undefined : () => setPicked(home));
  const show = (to: P) => {
    haptic('pageSettled');
    setPicked(to);
  };
  return { page, show };
}
