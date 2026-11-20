import { useRoute } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';

/** A navigator's state, as far as its routes and the focused one. */
interface Routes {
  readonly index?: number;
  readonly routes: readonly { readonly key?: string; readonly state?: Routes }[];
}

/** The key of the route focused in the navigator that `root`'s route `key` holds. */
export function focusedKey(root: Routes, key: string): string | undefined {
  const own = root.routes.find((route) => route.key === key)?.state;
  return own?.routes[own.index ?? own.routes.length - 1]?.key;
}

/**
 * The history entry a layout's navigator is at: its focused route's key. A
 * push or Back changes it; the address following the game within one entry
 * (a replace, a param dropped) keeps it.
 */
export function useHistoryEntry() {
  const { key } = useRoute();
  return useNavigationState((root) => focusedKey(root, key));
}
