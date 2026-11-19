import {
  createContext,
  type Dispatch,
  type ReactNode,
  use,
  useEffect,
  useReducer,
} from 'react';

import {
  DEFAULT_SETTINGS,
  parseSettings,
  type Settings,
  type SettingsAction,
  settingsReducer,
} from './settings';

// Kept in localStorage (on Android, expo-sqlite provides it; see
// src/app/_layout.tsx). This file is the only code that touches it.
const KEY = 'settings';

const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);
const DispatchContext = createContext<Dispatch<SettingsAction>>(() => {});

/**
 * Holds the learner's settings for everything inside it. It starts from the
 * defaults, as the pre-rendered page does, loads the remembered settings once
 * the app starts, and saves them after each change.
 */
export function SettingsProvider({ children }: { readonly children: ReactNode }) {
  const [settings, dispatch] = useReducer(settingsReducer, DEFAULT_SETTINGS);

  useEffect(() => {
    const stored = readStorage();
    if (stored != null) dispatch({ type: 'loaded', settings: parseSettings(stored) });
  }, []);

  useEffect(() => {
    // Only the starting defaults are this exact object; saving them would
    // overwrite the remembered settings before they load.
    if (settings !== DEFAULT_SETTINGS) writeStorage(JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext value={settings}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </SettingsContext>
  );
}

/** The learner's settings. */
export const useSettings = () => use(SettingsContext);

/** Changes settings: `dispatch({ type: 'chosen', choice: { opponent: 1900 } })`. */
export const useSettingsDispatch = () => use(DispatchContext);

function readStorage() {
  try {
    return globalThis.localStorage?.getItem(KEY);
  } catch {
    // Storage can be blocked, for example in a private window.
    return null;
  }
}

function writeStorage(text: string) {
  try {
    globalThis.localStorage?.setItem(KEY, text);
  } catch {
    // Kept for this visit only.
  }
}
