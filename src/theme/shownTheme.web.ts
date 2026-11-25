import type { Theme as ThemeChoice } from '@/settings/settings';

import { BAR_COLORS, BAR_IDS } from './barColor';
import { cssVariables } from './cssVariables';

// How the web shows the theme: every color a CSS variable (cssVariables.ts),
// whose values the page's head sets (schemeCss.ts). The native counterpart,
// shownTheme.ts, documents each export.

const light = cssVariables('light');
const dark = cssVariables('dark');

export const shownThemes = { light: light.theme, dark: dark.theme };

// The same variables in both schemes, so no need to read which is shown.
export const useSchemeColors = () => light.schemeColors;

/**
 * Pins <html data-theme>, which picks the variables' values, and the browser's
 * bars (barColor.ts) to the learner's theme.
 */
export function pinTheme(theme: ThemeChoice) {
  const { dataset } = document.documentElement;
  if (theme === 'system') delete dataset.theme;
  else dataset.theme = theme;
  for (const scheme of ['light', 'dark'] as const) {
    const meta = document.getElementById(BAR_IDS[scheme]) as HTMLMetaElement | null;
    if (meta) meta.content = BAR_COLORS[theme === 'system' ? scheme : theme];
  }
}
