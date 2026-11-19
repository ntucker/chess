import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { DEFAULT_SETTINGS, type Settings } from './settings';
import { SettingsProvider, useSettings, useSettingsDispatch } from './SettingsProvider';

// Babel builds process.env.EXPO_OS in, and Jest builds for iOS, so these run
// the native path: the first render already has the remembered settings. The
// web path (defaults first, then the remembered settings once the page
// starts) is checked in the browser.
let stored: Record<string, string>;
let root: Root | undefined;

beforeEach(() => {
  stored = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

/** Renders the provider, and answers every settings value its child rendered with. */
async function renderSettings(choose?: Partial<Settings>) {
  const seen: Settings[] = [];
  function Child() {
    const settings = useSettings();
    const dispatch = useSettingsDispatch();
    seen.push(settings);
    if (choose && settings.opponent !== choose.opponent) {
      queueMicrotask(() => dispatch({ type: 'chosen', choice: choose }));
    }
    return null;
  }
  await act(async () => {
    root = createRoot();
    root.render(
      <SettingsProvider>
        <Child />
      </SettingsProvider>,
    );
  });
  return seen;
}

describe('SettingsProvider', () => {
  it('renders the remembered settings from the first frame on native', async () => {
    stored.settings = JSON.stringify({ opponent: 1900, evaluationEngine: 'maia' });
    const seen = await renderSettings();
    expect(seen[0]).toEqual({ ...DEFAULT_SETTINGS, opponent: 1900, evaluationEngine: 'maia' });
  });

  it('reads the evaluation engine saved before settings were one object', async () => {
    stored.evaluationEngine = 'maia';
    const seen = await renderSettings();
    expect(seen[0]).toEqual({ ...DEFAULT_SETTINGS, evaluationEngine: 'maia' });
  });

  it('saves a choice, and nothing before one', async () => {
    await renderSettings();
    expect(stored).toEqual({});
    await act(async () => root?.unmount());
    await renderSettings({ opponent: 'stockfish' });
    expect(JSON.parse(stored.settings)).toEqual({ ...DEFAULT_SETTINGS, opponent: 'stockfish' });
  });
});
