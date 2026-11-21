import type { Theme as ThemeChoice } from '@/settings/settings';

import { cssVariables } from './cssVariables';

// How the web shows the theme: every color a CSS variable (cssVariables.ts),
// whose values the page's head sets (schemeCss.ts). The native counterpart,
// shownTheme.ts, documents each export.

const light = cssVariables('light');
const dark = cssVariables('dark');

export const shownThemes = { light: light.theme, dark: dark.theme };

// The same variables in both schemes, so no need to read which is shown.
export const useSchemeColors = () => light.schemeColors;

/** Pins <html data-theme>, which picks the variables' values, to the learner's theme. */
export function pinTheme(theme: ThemeChoice) {
  const { dataset } = document.documentElement;
  if (theme === 'system') delete dataset.theme;
  else dataset.theme = theme;
}
