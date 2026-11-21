import { SilkProvider } from '@reactive/silk-native';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

import { useSettings } from '@/settings/SettingsProvider';

import { navigationThemes } from './navigationTheme';
import { pinTheme, shownThemes } from './shownTheme';
import { useColorScheme } from './useColorScheme';

const NATIVE = process.env.EXPO_OS !== 'web';

/**
 * Colors everything inside it light or dark: the learner's `theme` setting, or
 * the device's while it is `system`. Throws outside SettingsProvider.
 */
export function AppTheme({ children }: { readonly children: ReactNode }) {
  const { theme } = useSettings();
  const device = useColorScheme();
  const colorScheme = theme === 'system' ? device : theme;
  // On the web the page's head already pinned the saved theme before the
  // first paint, and the first run here sees the defaults (SettingsProvider
  // loads after it), so the web pins only later choices. Natively it pins from
  // the first frame.
  const firstRunDone = useRef(false);
  useLayoutEffect(() => {
    if (NATIVE || firstRunDone.current) pinTheme(theme);
    firstRunDone.current = true;
  }, [theme]);
  return (
    <SilkProvider theme={shownThemes[colorScheme]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={navigationThemes[colorScheme]}>{children}</ThemeProvider>
    </SilkProvider>
  );
}
