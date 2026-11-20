import { unstable_useIsNavigating, useRouter } from 'expo-router';
import { useEffect } from 'react';

/**
 * Navigation to a page that loads first, such as another lesson: outside a
 * transition, so the address moves at once and the page shows that it is
 * loading, rather than the page being left staying up until then.
 */
export const AT_ONCE = { inTransition: false } as const;

/**
 * Puts every navigation in a transition (`AT_ONCE` opts one out), so it never
 * blocks input and the page being left keeps what it shows until the next is
 * ready. The root layout calls it. It sets the router once the router is up:
 * set before, the router has already read its default.
 */
export function useNavigationTransitions() {
  const router = useRouter();
  useEffect(() => router.setTransitionMode('always'), [router]);
}

/**
 * Whether a navigation is under way, so the page on screen may be one being
 * left: in a transition, it stays up until the next is ready.
 */
export const useNavigating = unstable_useIsNavigating;
