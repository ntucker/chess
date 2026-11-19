import { beforeEach, describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'test-renderer';

import type { Settings } from './settings';
import { SettingsProvider, useSettings, useSettingsDispatch } from './SettingsProvider';

// Jest runs as native (EXPO_OS is 'ios'), where the first render already has
// the remembered settings. The web's load after hydration is checked in the
// browser.
let stored: Record<string, string>;
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
    createRoot().render(
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
    expect(await renderSettings()).toEqual([{ opponent: 1900, evaluationEngine: 'maia' }]);
  });

  it('reads the evaluation engine saved before settings were one object', async () => {
    stored.evaluationEngine = 'maia';
    expect((await renderSettings())[0]).toEqual({ opponent: 1500, evaluationEngine: 'maia' });
  });

  it('saves a choice, and nothing before one', async () => {
    await renderSettings();
    expect(stored).toEqual({});
    await renderSettings({ opponent: 'stockfish' });
    expect(JSON.parse(stored.settings)).toEqual({
      opponent: 'stockfish',
      evaluationEngine: 'stockfish',
    });
  });
});
