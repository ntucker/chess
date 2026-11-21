import type { ColorScheme } from '@reactive/silk-core';

import { readStorageScript } from '@/context/storage';
import { SETTINGS_KEY, THEMES } from '@/settings/settings';

import { cssVariables } from './cssVariables';

// What each web page's head needs to show the learner's colors before its
// first paint (src/app/+html.tsx). Only the export loads this file.

/** One scheme's declarations: its `color-scheme` and each color variable's value. */
const declarationsFor = (colorScheme: ColorScheme) =>
  `color-scheme:${colorScheme};` +
  [...cssVariables(colorScheme).declarations].map(([name, value]) => `${name}:${value};`).join('');

/**
 * The color variables' values: light, or dark when the learner chose Dark, or
 * chose nothing (System) on a dark device. The page behind the app takes the
 * stage's color: `:root` outweighs Board.css's `html, body` (written for the
 * Android board's web view, but loaded on every web page too).
 */
export const SCHEME_CSS = [
  `:root{${declarationsFor('light')}}`,
  `:root[data-theme=dark]{${declarationsFor('dark')}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${declarationsFor('dark')}}}`,
  ':root,:root>body{background-color:var(--chess-color-surface)}',
].join('\n');

/** The themes a learner can choose, which pin the scheme whatever the device says. */
const CHOSEN = THEMES.filter((theme) => theme !== 'system');

/**
 * A script that, before the first paint, sets <html data-theme> to the theme
 * the learner saved (read as settings.ts reads it), so SCHEME_CSS shows the
 * page in its colors. System needs nothing. Later, AppTheme keeps it pinned.
 */
export const PRE_PAINT_SCRIPT =
  `try{var t=JSON.parse(${readStorageScript(SETTINGS_KEY)}).theme;` +
  `if(${JSON.stringify(CHOSEN)}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}`;
