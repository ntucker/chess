import { useSyncExternalStore } from 'react';

// Settings the learner picks, remembered in localStorage (on Android,
// expo-sqlite provides it; see src/app/_layout.tsx).

/** One remembered value, read with a hook and changed with `set`. */
export interface Setting<T> {
  /**
   * The current value. The server renders the fallback, and the page switches
   * to the remembered value as it starts.
   */
  useValue(): T;
  /** Changes the value, and remembers it. */
  set(value: T): void;
}

/**
 * A setting stored under `key` as text. `parse` reads the stored text back,
 * and answers undefined for text that is no longer a valid value, which then
 * reads as `fallback`, as does a setting never set.
 */
export function createSetting<T>(
  key: string,
  parse: (stored: string) => T | undefined,
  fallback: T,
): Setting<T> {
  const listeners = new Set<() => void>();
  let current: { value: T } | undefined;

  const read = (): T => {
    if (current) return current.value;
    let value = fallback;
    try {
      const stored = globalThis.localStorage?.getItem(key);
      value = (stored == null ? undefined : parse(stored)) ?? fallback;
    } catch {
      // Storage can be blocked, for example in a private window.
    }
    current = { value };
    return value;
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return {
    useValue: () => useSyncExternalStore(subscribe, read, () => fallback),
    set(value) {
      current = { value };
      try {
        globalThis.localStorage?.setItem(key, String(value));
      } catch {
        // Kept for this visit only.
      }
      for (const listener of listeners) listener();
    },
  };
}

/** Parses stored text that must be one of `choices`, for createSetting. */
export const oneOf =
  <T extends string>(choices: readonly T[]) =>
  (stored: string): T | undefined =>
    choices.find((choice) => choice === stored);
