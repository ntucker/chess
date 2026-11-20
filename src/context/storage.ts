// What the app remembers on the device, in localStorage (on Android,
// expo-sqlite provides it; see src/app/_layout.tsx). This file is the only
// code that touches it: the settings (SettingsProvider) and lesson progress
// (src/resources/progress.ts) are kept here.

/** The text saved under `key`, or null (or undefined) when there is none. */
export function readStorage(key: string) {
  try {
    return globalThis.localStorage?.getItem(key);
  } catch {
    // Storage can be blocked, for example in a private window.
    return null;
  }
}

/** Saves `text` under `key`, for this visit only when storage is blocked. */
export function writeStorage(key: string, text: string) {
  try {
    globalThis.localStorage?.setItem(key, text);
  } catch {
    // Kept for this visit only.
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
