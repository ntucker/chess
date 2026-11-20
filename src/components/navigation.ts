/**
 * Navigation to a page that loads first, such as another lesson: outside a
 * transition (the root layout puts all other navigation in one), so the
 * address moves at once and the page shows that it is loading, rather than
 * the page being left staying up with no sign of it until then.
 */
export const AT_ONCE = { inTransition: false } as const;
