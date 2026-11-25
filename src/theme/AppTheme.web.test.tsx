import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import type { Theme } from '@reactive/silk-core';
import { useTheme } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SettingsProvider, useSettingsDispatch } from '@/settings/SettingsProvider';

import { AppTheme } from './AppTheme';
import { BAR_COLORS, barMedia } from './barColor';
import { shownThemes } from './shownTheme';

// The web path: the page's head pinned <html data-theme> to the saved theme
// (schemeCss.ts's PRE_PAINT_SCRIPT), and the colors are CSS variables.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
const html = document.documentElement;

beforeEach(() => {
  localStorage.clear();
  delete html.dataset.theme;
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

/** Renders the app's theme with Dark saved, as the page's head leaves it. */
async function renderSavedDark() {
  localStorage.setItem('settings', JSON.stringify({ theme: 'dark' }));
  html.dataset.theme = 'dark';
  // What data-theme held before each change: null if it went missing.
  const changes: (string | null)[] = [];
  new MutationObserver((records) => changes.push(...records.map((r) => r.oldValue))).observe(html, {
    attributeFilter: ['data-theme'],
    attributeOldValue: true,
  });
  const seen: Theme[] = [];
  let dispatch: ReturnType<typeof useSettingsDispatch> | undefined;
  function Child() {
    seen.push(useTheme().theme);
    dispatch = useSettingsDispatch();
    return null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root!.render(
      <SettingsProvider>
        <AppTheme>
          <Child />
        </AppTheme>
      </SettingsProvider>,
    ),
  );
  const choose = (theme: 'system' | 'light' | 'dark') =>
    act(async () => dispatch!({ type: 'chosen', choice: { theme } }));
  return { changes, seen, choose };
}

describe('AppTheme on the web', () => {
  it('shows the CSS-variable themes, leaving the saved theme pinned while it loads', async () => {
    const { changes, seen } = await renderSavedDark();
    expect(seen[0]).toBe(shownThemes.light);
    expect(seen.at(-1)).toBe(shownThemes.dark);
    await act(async () => {});
    expect(changes).not.toContain(null);
    expect(html.dataset.theme).toBe('dark');
  });

  it("pins the learner's later choices, and unpins System", async () => {
    const { choose } = await renderSavedDark();
    await choose('light');
    expect(html.dataset.theme).toBe('light');
    await choose('system');
    expect(html.dataset.theme).toBeUndefined();
  });

  it("colors the browser's bars as the learner's theme, or each scheme's own under System", async () => {
    // The page's head, as src/app/+html.tsx writes it.
    const bars = (['light', 'dark'] as const).map((scheme) =>
      Object.assign(document.createElement('meta'), {
        name: 'theme-color',
        media: barMedia(scheme),
        content: BAR_COLORS[scheme],
      }),
    );
    document.head.append(...bars);
    const colors = () => bars.map((bar) => bar.content);
    const { choose } = await renderSavedDark();
    await choose('light');
    expect(colors()).toEqual([BAR_COLORS.light, BAR_COLORS.light]);
    await choose('dark');
    expect(colors()).toEqual([BAR_COLORS.dark, BAR_COLORS.dark]);
    await choose('system');
    expect(colors()).toEqual([BAR_COLORS.light, BAR_COLORS.dark]);
    bars.forEach((bar) => bar.remove());
  });
});
