import type { ColorScheme } from '@reactive/silk-core';

import { themes } from './theme';

// A phone browser's bars, and an installed web app's status bar, take the
// page's surface color from <meta name="theme-color">: the page's head has one
// for each scheme, which the device's setting picks between (src/app/+html.tsx),
// and a theme the learner pins sets both to its own color (`pinTheme` in shownTheme.web.ts, and the head's script before the first paint).

/** The bars' color in each scheme. */
export const BAR_COLORS: Readonly<Record<ColorScheme, string>> = {
  light: themes.light.semantic.color.surface,
  dark: themes.dark.semantic.color.surface,
};

/** The `media` of a scheme's <meta name="theme-color">. */
export const barMedia = (scheme: ColorScheme) => `(prefers-color-scheme: ${scheme})`;
