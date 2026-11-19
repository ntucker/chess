import { createContext, type Dispatch, type ReactNode, use, useEffect, useReducer } from 'react';

import { requireProvider } from '@/context/requireProvider';

import {
  DEFAULT_SETTINGS,
  parseSettings,
  settingsFrom,
  type Settings,
  type SettingsAction,
  settingsReducer,
} from './settings';

// Kept in localStorage (on Android, expo-sqlite provides it; see
// src/app/_layout.tsx). This file is the only code that touches it.
const KEY = 'settings';
// Before the settings were one object, the evaluation bar's engine was saved
// alone under this key; it is read once, while nothing is saved under KEY.
const LEGACY_EVALUATION_ENGINE_KEY = 'evaluationEngine';

// Native has no pre-rendered page to match, so its first frame can show the
// remembered settings; the web loads them after hydration.
const NATIVE = process.env.EXPO_OS !== 'web';

// No defaults: a component outside SettingsProvider fails loudly rather than
// reading defaults and dropping changes.
const SettingsContext = createContext<Settings | null>(null);
const DispatchContext = createContext<Dispatch<SettingsAction> | null>(null);

/**
 * Holds the learner's settings for everything inside it, and saves them after
 * each change. On native it starts from the remembered settings. On the web
 * it starts from the defaults, as the pre-rendered page does, and loads the
 * remembered settings once the page starts.
 */
export function SettingsProvider({ children }: { readonly children: ReactNode }) {
  const [settings, dispatch] = useReducer(settingsReducer, undefined, () =>
    NATIVE ? (loadSettings() ?? DEFAULT_SETTINGS) : DEFAULT_SETTINGS,
  );

  useEffect(() => {
    if (NATIVE) return;
    const remembered = loadSettings();
    if (remembered) dispatch({ type: 'loaded', settings: remembered });
  }, []);

  useEffect(() => {
    // DEFAULT_SETTINGS itself means nothing was chosen or remembered yet. On
    // the web, saving it would overwrite the remembered settings before they
    // load; any choice, even of the default values, is a new object.
    if (settings !== DEFAULT_SETTINGS) writeStorage(JSON.stringify(settings));
  }, [settings]);

  return (
    <SettingsContext value={settings}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </SettingsContext>
  );
}

/** The learner's settings. Throws outside SettingsProvider. */
export const useSettings = () => requireProvider(use(SettingsContext), 'SettingsProvider');

/**
 * Changes settings: `dispatch({ type: 'chosen', choice: { opponent: 1900 } })`.
 * Throws outside SettingsProvider.
 */
export const useSettingsDispatch = () => requireProvider(use(DispatchContext), 'SettingsProvider');

/** The remembered settings, or undefined when nothing is remembered. */
function loadSettings(): Settings | undefined {
  const stored = readStorage(KEY);
  if (stored != null) return parseSettings(stored);
  const evaluationEngine = readStorage(LEGACY_EVALUATION_ENGINE_KEY);
  return evaluationEngine == null ? undefined : settingsFrom({ evaluationEngine });
}

function readStorage(key: string) {
  try {
    return globalThis.localStorage?.getItem(key);
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
