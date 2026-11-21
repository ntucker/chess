import { type Href, type ImperativeRouter, router, unstable_useIsNavigating } from 'expo-router';

/**
 * Navigation to a page that loads first, such as another lesson: outside a
 * transition, so the address moves at once and the page shows that it is
 * loading, rather than the page being left staying up until then.
 */
export const AT_ONCE = { inTransition: false } as const;

/**
 * Puts every navigation in a transition (`AT_ONCE` opts one out), so it never
 * blocks input and the page being left keeps what it shows until the next is
 * ready. The app's entry (`index.ts`) calls it before Expo Router first
 * renders, which is when the router reads it. Set any later, as from a
 * layout's effect, the change re-renders the router while the page is still
 * hydrating, and on the web the home page can then stay loading forever.
 */
export function navigateInTransitions() {
  router.setTransitionMode('always');
}

/**
 * Back to the page underneath, which a stack keeps as the learner left it,
 * then on to `next` there when given, such as another line picked from the
 * list: Back then returns to the game left there, not to this page. With
 * nothing underneath, as after a reload, `next ?? fallback` replaces this
 * page. A move on goes at once, the back with it, so neither waits for the
 * other in a transition.
 */
export function goBack(router: ImperativeRouter, fallback: Href, next?: Href) {
  if (!router.canGoBack()) router.replace(next ?? fallback, AT_ONCE);
  else if (next === undefined) router.back();
  else {
    router.back(AT_ONCE);
    router.push(next, AT_ONCE);
  }
}

/**
 * Whether a navigation is under way, so the page on screen may be one being
 * left: in a transition, it stays up until the next is ready. Expo Router
 * marks it unstable (`unstable_useIsNavigating`): check it on an upgrade.
 */
export const useNavigating = unstable_useIsNavigating;
