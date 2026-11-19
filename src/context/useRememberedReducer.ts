import { type Dispatch, useEffect, useEffectEvent, useReducer } from 'react';

import { writeStorage } from './storage';

// Native has no pre-rendered page to match, so its first frame can show the
// remembered state; the web loads it after hydration.
const NATIVE = process.env.EXPO_OS !== 'web';

interface Remembered<S, A> {
  /** Where the state is saved, as JSON. */
  readonly key: string;
  /** The remembered state, or undefined when nothing is remembered (read with `./storage.ts`). */
  readonly recall: () => S | undefined;
  /** The action that takes in the remembered state, once the web page starts. */
  readonly loaded: (remembered: S) => A;
}

/**
 * `useReducer` for state the device remembers, saved after each change. On
 * native the first render already has the remembered state. On the web it
 * starts from `initial`, as the pre-rendered page does, and dispatches
 * `loaded` with the remembered state once the page starts.
 */
export function useRememberedReducer<S, A>(
  reducer: (state: S, action: A) => S,
  initial: S,
  { key, recall, loaded }: Remembered<S, A>,
): [S, Dispatch<A>] {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    NATIVE ? (recall() ?? initial) : initial,
  );

  const load = useEffectEvent(() => {
    const remembered = recall();
    if (remembered !== undefined) dispatch(loaded(remembered));
  });
  useEffect(() => {
    if (!NATIVE) load();
  }, []);

  useEffect(() => {
    // `initial` itself means nothing changed or was remembered yet. On the
    // web, saving it would overwrite the remembered state before it loads;
    // any change, even back to the initial values, is a new object.
    if (state !== initial) writeStorage(key, JSON.stringify(state));
  }, [key, initial, state]);

  return [state, dispatch];
}
