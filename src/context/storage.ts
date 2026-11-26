// What the app remembers on the device, in localStorage (on Android,
// expo-sqlite provides it; see src/app/_layout.tsx). This file is the only
// code that touches it: the settings (SettingsProvider), lesson progress
// (src/resources/progress.ts) and the learner's lichess sign-in
// (src/resources/accounts.ts) are kept here.

// Pull request previews share the live site's origin, so their builds set a
// prefix (.github/workflows/web.yml) to keep their own saves.
const PREFIX = process.env.EXPO_PUBLIC_STORAGE_PREFIX ?? '';

/** The key `name` is saved under in this build. */
export const storageKey = (name: string) => `${PREFIX}${name}`;

/**
 * JavaScript that reads the text saved under `key`, for a script in a web
 * page's head that runs before the app does (src/theme/schemeCss.ts). It
 * throws where storage is blocked.
 */
export const readStorageScript = (key: string) =>
  `localStorage.getItem(${JSON.stringify(key).replace(/</g, '\\u003c')})`;

// What could not be saved (storage blocked, for example in a private window,
// or full), kept for this visit so later reads still see it.
const unsaved = new Map<string, string>();

/** The text saved under `key`, or null (or undefined) when there is none. */
export function readStorage(key: string) {
  if (unsaved.has(key)) return unsaved.get(key);
  try {
    return globalThis.localStorage?.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Calls `onChange` whenever another tab saves under `key` (the web's
 * `storage` event; native has one window), and returns how to stop. What that
 * tab saved replaces anything this visit could not save there.
 */
export function subscribeStorage(key: string, onChange: () => void) {
  if (process.env.EXPO_OS !== 'web') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) return;
    unsaved.delete(key);
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

/** Saves `text` under `key`, for this visit only when storage is blocked. */
export function writeStorage(key: string, text: string) {
  try {
    globalThis.localStorage?.setItem(key, text);
    unsaved.delete(key);
  } catch {
    unsaved.set(key, text);
  }
}

/**
 * The object saved as `text` (JSON), or an empty one when the text is damaged
 * or holds something else, so a reader can check each field it wants.
 */
export function parseStoredObject(text: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(text);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Whether `value` is a plain object, as JSON reads one: not null, not an array. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
