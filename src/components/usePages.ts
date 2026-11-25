import { useState } from 'react';

import { useCloseKeys } from '@/components/useCloseKeys';

/**
 * Which page shows under the board, of a few side by side (the lesson and
 * its scoresheet): the one owner the move pill, a sideways swipe (a silk
 * `Pager` proposing its page) and Android's back all go through. Away from
 * `home`, Escape and Android's back return there while the screen is in
 * front. While not `shown` (a wide page, which lays the pages out
 * otherwise), the page reads as `home`, so nothing unseen takes Back; the
 * page picked comes back if the pages show again.
 */
export function usePages<P extends string>(
  home: P,
  shown: boolean,
): { readonly page: P; readonly show: (page: P) => void } {
  const [picked, show] = useState<P>(home);
  const page = shown ? picked : home;
  useCloseKeys(page === home ? undefined : () => show(home));
  return { page, show };
}
