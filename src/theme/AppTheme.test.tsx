import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, type ReactNode } from 'react';
import { Appearance } from 'react-native';
import { createRoot, type Root } from 'test-renderer';

import type { Theme } from '@/settings/settings';
import { SettingsProvider } from '@/settings/SettingsProvider';

import { AppTheme } from './AppTheme';

// Jest builds for native (see SettingsProvider.test.tsx), so the first render
// has the remembered theme. The native project can't load Silk's ES modules,
// so the themes are stand-ins and Silk's provider notes each one's scheme.
jest.mock('./theme', () => ({
  themes: { light: { colorScheme: 'light' }, dark: { colorScheme: 'dark' } },
}));
jest.mock('./navigationTheme', () => ({
  navigationThemes: { light: { dark: false }, dark: { dark: true } },
}));
let mockSeen: string[] = [];
jest.mock('@reactive/silk-native', () => ({
  SilkProvider: ({ theme, children }: { theme: { colorScheme: string }; children: ReactNode }) => {
    mockSeen.push(theme.colorScheme);
    return children;
  },
}));

let root: Root | undefined;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  jest.restoreAllMocks();
});

/** The color schemes rendered with `theme` remembered, on a device set to `device`. */
async function renderScheme(theme: Theme, device: 'light' | 'dark') {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(device);
  const stored: Record<string, string> = { settings: JSON.stringify({ theme }) };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key: string) => stored[key] ?? null, setItem: () => {} },
  });
  mockSeen = [];
  await act(async () => {
    root = createRoot();
    root.render(
      <SettingsProvider>
        <AppTheme>{null}</AppTheme>
      </SettingsProvider>,
    );
  });
  return mockSeen;
}

describe('AppTheme', () => {
  it.each(['light', 'dark'] as const)(
    "follows a %s device's setting while the theme is System",
    async (device) => {
      expect(await renderScheme('system', device)).toEqual([device]);
      expect(Appearance.setColorScheme).toHaveBeenLastCalledWith('auto');
    },
  );

  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)('keeps %s on a %s device, and tells the device', async (theme, device) => {
    expect(await renderScheme(theme, device)).toEqual([theme]);
    expect(Appearance.setColorScheme).toHaveBeenLastCalledWith(theme);
  });
});
