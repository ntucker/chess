import { type Href, type ImperativeRouter, unstable_useIsNavigating, useRouter } from 'expo-router';
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
/**
 * Back to the page underneath, which a stack keeps as the learner left it,
 * then on to `then` there when given, such as another line picked from the
 * list: Back then returns to the game left there, not to this page. With
 * nothing underneath, as after a reload, `then ?? fallback` replaces this
 * page. A move on goes at once, the back with it, so neither waits for the
 * other in a transition.
 */
export function goBack(router: ImperativeRouter, fallback: Href, then?: Href) {
  if (!router.canGoBack()) router.replace(then ?? fallback, AT_ONCE);
  else if (then === undefined) router.back();
  else {
    router.back(AT_ONCE);
    router.push(then, AT_ONCE);
  }
}

export function useNavigationTransitions() {
  const router = useRouter();
  useEffect(() => router.setTransitionMode('always'), [router]);
}

/**
 * Whether a navigation is under way, so the page on screen may be one being
 * left: in a transition, it stays up until the next is ready. Expo Router
 * marks it unstable (`unstable_useIsNavigating`): check it on an upgrade.
 */
export const useNavigating = unstable_useIsNavigating;
