import { type ReactNode, useSyncExternalStore } from 'react';

interface Props {
  /** What the pre-rendered page and the first render in the browser show. */
  readonly fallback: ReactNode;
  readonly children: ReactNode;
}

/**
 * Renders `children` only once the page runs in the browser (or on native),
 * and `fallback` in the static export. Screens read data with `useSuspense`
 * inside it, since a read during the export hangs it: Data Client fetches in
 * an effect, which never runs there.
 */
export function BrowserOnly({ fallback, children }: Props) {
  const inBrowser = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return inBrowser ? children : fallback;
}

const subscribeNever = () => () => {};
