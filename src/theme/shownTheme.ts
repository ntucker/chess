import { useTheme } from '@reactive/silk-native';
import { Appearance } from 'react-native';

import type { Theme as ThemeChoice } from '@/settings/settings';

import { schemeColors, themes } from './theme';

// How this platform shows the theme. Natively, as plain colors; the web's
// counterpart is shownTheme.web.ts.

/** The themes to give Silk, by scheme. */
export const shownThemes = themes;

/** The scheme colors (theme.ts) for the theme shown. Never compute with them: on the web they are CSS variables. */
export function useSchemeColors() {
  return schemeColors[useTheme().theme.colorScheme];
}

/**
 * Pins the platform's own parts to the learner's theme. Android draws its own
 * parts (the window behind the app, the keyboard, dialogs) in the device's
 * colors unless told otherwise. The status and navigation bars' icons follow
 * it too (SYSTEM_BAR_ICONS in app.config.ts).
 */
export function pinTheme(theme: ThemeChoice) {
  Appearance.setColorScheme(theme === 'system' ? 'auto' : theme);
}
