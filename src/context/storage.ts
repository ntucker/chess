// What the app remembers on the device, in localStorage (on Android,
// expo-sqlite provides it; see src/app/_layout.tsx). This file is the only
// code that touches it: the settings (SettingsProvider) and lesson progress
// (src/resources/progress.ts) are kept here.

// Pull request previews share the live site's origin, so their builds set a
// prefix (.github/workflows/web.yml) to keep their own saves.
const PREFIX = process.env.EXPO_PUBLIC_STORAGE_PREFIX ?? '';

/** The key `name` is saved under in this build. */
export const storageKey = (name: string) => `${PREFIX}${name}`;

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
