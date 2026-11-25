import type { ColorScheme } from '@reactive/silk-core';

import { themes } from './theme';

// A phone browser's bars, and an installed web app's status bar, take the
// page's surface color from <meta name="theme-color">: the page's head has one
// for each scheme, which the device's setting picks between (src/app/+html.tsx),
// and a theme the learner pins sets both to its own color (schemeCss.ts's
// PRE_PAINT_SCRIPT before the first paint, then `pinTheme` in shownTheme.web.ts).

/** The bars' color in each scheme. */
export const BAR_COLORS: Readonly<Record<ColorScheme, string>> = {
  light: themes.light.semantic.color.surface,
  dark: themes.dark.semantic.color.surface,
};

/** The id of each scheme's <meta name="theme-color">. */
export const BAR_IDS: Readonly<Record<ColorScheme, string>> = {
  light: 'bar-light',
  dark: 'bar-dark',
};

/** The props of a scheme's <meta name="theme-color">, as the page's head writes it. */
export const barMeta = (scheme: ColorScheme) => ({
  id: BAR_IDS[scheme],
  name: 'theme-color',
  media: `(prefers-color-scheme: ${scheme})`,
  content: BAR_COLORS[scheme],
});
