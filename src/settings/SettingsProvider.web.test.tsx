import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { DEFAULT_SETTINGS, type Settings } from './settings';
import { SettingsProvider, useSettings } from './SettingsProvider';

// The web path: defaults first, as the pre-rendered page has them, then the
// remembered settings once the page starts, and another tab's when it saves.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;

beforeEach(() => localStorage.clear());
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

async function renderSettings() {
  const seen: Settings[] = [];
  function Child() {
    seen.push(useSettings());
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root!.render(
      <SettingsProvider>
        <Child />
      </SettingsProvider>,
    ),
  );
  return seen;
}

describe('SettingsProvider on the web', () => {
  it('starts from the defaults, then loads the remembered settings', async () => {
    localStorage.setItem('settings', JSON.stringify({ opponent: 1900 }));
    const seen = await renderSettings();
    expect(seen[0]).toBe(DEFAULT_SETTINGS);
    expect(seen.at(-1)?.opponent).toBe(1900);
  });

  it("takes another tab's settings when it saves them", async () => {
    const seen = await renderSettings();
    const newValue = JSON.stringify({ opponent: 1100 });
    localStorage.setItem('settings', newValue);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'settings', newValue }));
    });
    expect(seen.at(-1)?.opponent).toBe(1100);
  });

  it("doesn't write back what it loads, so tabs on two builds don't echo each other", async () => {
    await renderSettings();
    // An older build's save, which has no theme.
    const newValue = JSON.stringify({ opponent: 1100 });
    localStorage.setItem('settings', newValue);
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'settings', newValue }));
    });
    expect(localStorage.getItem('settings')).toBe(newValue);
  });
});
