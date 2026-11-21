import type { ColorScheme, Theme } from '@reactive/silk-core';
import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from 'expo-router';

import { shownThemes } from '@/theme/schemeCss';

const navigationTheme = (base: NavigationTheme, { semantic: { color } }: Theme) => ({
  ...base,
  colors: {
    ...base.colors,
    background: color.surface,
    card: color.surface,
    text: color.textPrimary,
    border: color.borderSubtle,
  },
});

/**
 * React Navigation's colors, from the app's: a screen it paints before its
 * content renders shows the stage, not React Navigation's light gray.
 */
export const navigationThemes: Readonly<Record<ColorScheme, NavigationTheme>> = {
  light: navigationTheme(DefaultTheme, shownThemes.light),
  dark: navigationTheme(DarkTheme, shownThemes.dark),
};
