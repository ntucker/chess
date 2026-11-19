import { createContext, type Dispatch, type ReactNode, use } from 'react';

import { requireProvider } from '@/context/requireProvider';
import { readStorage, useRememberedReducer } from '@/context/useRememberedReducer';

import {
  DEFAULT_SETTINGS,
  parseSettings,
  settingsFrom,
  type Settings,
  type SettingsAction,
  settingsReducer,
} from './settings';

const KEY = 'settings';
// Before the settings were one object, the evaluation bar's engine was saved
// alone under this key; it is read once, while nothing is saved under KEY.
const LEGACY_EVALUATION_ENGINE_KEY = 'evaluationEngine';

// No defaults: a component outside SettingsProvider fails loudly rather than
// reading defaults and dropping changes.
const SettingsContext = createContext<Settings | null>(null);
const DispatchContext = createContext<Dispatch<SettingsAction> | null>(null);

const loaded = (settings: Settings): SettingsAction => ({ type: 'loaded', settings });

/**
 * Holds the learner's settings for everything inside it, and saves them after
 * each change. On native it starts from the remembered settings. On the web
 * it starts from the defaults, as the pre-rendered page does, and loads the
 * remembered settings once the page starts.
 */
export function SettingsProvider({ children }: { readonly children: ReactNode }) {
  const [settings, dispatch] = useRememberedReducer(settingsReducer, DEFAULT_SETTINGS, {
    key: KEY,
    recall: loadSettings,
    loaded,
  });
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
