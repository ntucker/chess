import {
  createContext,
  type Dispatch,
  type ReactNode,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useReducer,
} from 'react';

import { requireProvider } from '@/context/requireProvider';
import { readStorage, storageKey, subscribeStorage, writeStorage } from '@/context/storage';

import {
  DEFAULT_SETTINGS,
  parseSettings,
  settingsFrom,
  type Settings,
  type SettingsAction,
  settingsReducer,
} from './settings';

const KEY = storageKey('settings');
// Before the settings were one object, the evaluation bar's engine was saved
// alone under this key; it is read while nothing is saved under KEY.
const LEGACY_EVALUATION_ENGINE_KEY = storageKey('evaluationEngine');

// Native has no pre-rendered page to match, so its first frame can show the
// remembered settings; the web loads them after hydration.
const NATIVE = process.env.EXPO_OS !== 'web';

/**
 * Settings nobody chose, which are never saved: the defaults, and each one
 * read from storage (loadSettings adds it).
 */
const UNCHOSEN = new WeakSet<Settings>([DEFAULT_SETTINGS]);

// No defaults: a component outside SettingsProvider fails loudly rather than
// reading defaults and dropping changes.
const SettingsContext = createContext<Settings | null>(null);
const DispatchContext = createContext<Dispatch<SettingsAction> | null>(null);

/**
 * Holds the learner's settings for everything inside it, and saves them after
 * each change. On native it starts from the remembered settings. On the web
 * it starts from the defaults, as the pre-rendered page does, and loads the
 * remembered settings once the page starts, and again whenever another tab
 * saves its own.
 */
export function SettingsProvider({ children }: { readonly children: ReactNode }) {
  const [settings, dispatch] = useReducer(settingsReducer, undefined, () =>
    NATIVE ? (loadSettings() ?? DEFAULT_SETTINGS) : DEFAULT_SETTINGS,
  );

  const load = useEffectEvent(() => {
    const remembered = loadSettings();
    if (remembered) dispatch({ type: 'loaded', settings: remembered });
  });
  // A layout effect, so the remembered settings apply in the hydrated page's
  // first frame rather than the next: the theme would flash the device's first.
  useLayoutEffect(() => {
    if (NATIVE) return;
    load();
    return subscribeStorage(KEY, load);
  }, []);

  useEffect(() => {
    // Saves only what the learner chose. Settings read from storage are there
    // already, and writing them back could undo what was saved meanwhile;
    // between two tabs on builds with different fields, each tab's write would
    // fire the other's load and write forever. DEFAULT_SETTINGS means nothing
    // was chosen or remembered yet. Any choice, even of the same values, is a
    // new object.
    if (!UNCHOSEN.has(settings)) writeStorage(KEY, JSON.stringify(settings));
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

/** The remembered settings, marked unchosen, or undefined when nothing is remembered. */
function loadSettings(): Settings | undefined {
  const settings = readSettings();
  if (settings) UNCHOSEN.add(settings);
  return settings;
}

function readSettings(): Settings | undefined {
  const stored = readStorage(KEY);
  if (stored != null) return parseSettings(stored);
  const evaluationEngine = readStorage(LEGACY_EVALUATION_ENGINE_KEY);
  return evaluationEngine == null ? undefined : settingsFrom({ evaluationEngine });
}
