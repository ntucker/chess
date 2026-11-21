import { SilkProvider } from '@reactive/silk-native';
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { Appearance } from 'react-native';

import { useSettings } from '@/settings/SettingsProvider';

import { navigationThemes } from './navigationTheme';
import { setDocumentTheme, shownThemes } from './schemeCss';
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
  // Natively, Android draws its own parts (the window behind the app, the
  // keyboard, dialogs) in the device's colors unless told otherwise, from the
  // first frame. On the web the page's head pinned the saved theme before the
  // first paint, and this follows later choices; the first run, which sees
  // the defaults before SettingsProvider loads, would undo that for a moment.
  const started = useRef(false);
  useLayoutEffect(() => {
    if (NATIVE) Appearance.setColorScheme(theme === 'system' ? 'auto' : theme);
    else if (started.current) setDocumentTheme(theme);
    started.current = true;
  }, [theme]);
  return (
    <SilkProvider theme={shownThemes[colorScheme]}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <ThemeProvider value={navigationThemes[colorScheme]}>{children}</ThemeProvider>
    </SilkProvider>
  );
}
