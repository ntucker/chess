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
 * page picked comes back if the pages show again. A page picked that goes
 * `missing` (one the screen has nothing for now, such as the list of
 * opportunities in Practice or a lesson without one) is dropped for `home`,
 * so it doesn't come back on its own when it returns. A page `show` picks
 * ticks on Android; Back doesn't, since the system answers it.
 */
export function usePages<P extends string>(
  home: P,
  shown: boolean,
  missing: readonly P[] = [],
): { readonly page: P; readonly show: (page: P) => void } {
  const [picked, setPicked] = useState<P>(home);
  // Dropped while rendering, as React's state-from-props pattern does, so the
  // page doesn't come back when the screen has it again (an effect would show it for a frame).
  if (picked !== home && missing.includes(picked)) setPicked(home);
  const page = shown && !missing.includes(picked) ? picked : home;
  useCloseKeys(page === home ? undefined : () => setPicked(home));
  const show = (to: P) => {
    haptic('pageSettled');
    setPicked(to);
  };
  return { page, show };
}
