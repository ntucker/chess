import { useLocalSearchParams, useRoute } from 'expo-router';
import { useNavigationState } from 'expo-router/react-navigation';

/** An address's params, as the URL has them: a lesson's id, and a variation to open. */
interface Params {
  readonly id?: string;
  readonly variation?: string;
}

/** A route as far as the address needs it. */
interface Route {
  readonly key?: string;
  readonly params?: Params;
  readonly state?: Routes;
}

/** A navigator's state, as far as its routes and the focused one. */
interface Routes {
  readonly index?: number;
  readonly routes: readonly Route[];
}

/** The route focused in the navigator that `root`'s route `key` holds. */
export function focusedRoute(root: Routes, key: string): Route | undefined {
  const own = root.routes.find((route) => route.key === key)?.state;
  return own?.routes[own.index ?? own.routes.length - 1];
}

/**
 * The address of the openings layout's focused route, read from the layout's
 * own navigator, so a screen pushed in front (free play) doesn't change it.
 *
 * `entry` is the history entry: the route's key. A push, a replace or Back
 * changes it; only a change of variation keeps it (the game dropping one, or
 * a link to the lesson already open naming one). The params are the route's
 * own: the layout's (`useLocalSearchParams`) keep the first address's lesson
 * after a replace to `/`. Before the navigator has state (the first render,
 * and the static export) they come from the URL.
 */
export function useOpeningsAddress() {
  const { key } = useRoute();
  const route = useNavigationState((root) => focusedRoute(root, key));
  const url = useLocalSearchParams<{ id?: string; variation?: string }>();
  const { id, variation }: Params = route ? (route.params ?? {}) : url;
  return { entry: route?.key, id, variation };
}
