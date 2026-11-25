import type { ColorScheme } from '@reactive/silk-core';

import { readStorageScript } from '@/context/storage';
import { COLORS } from '@/game/replay';
import { SETTINGS_KEY, THEMES } from '@/settings/settings';

import { BAR_COLORS, BAR_IDS } from './barColor';
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
 * stage's color, over Board.css's transparent `html, body` (written for the
 * Android board's web view, but loaded on every web page too): `:root`
 * outweighs its `html`, and `:root>body` its `body`.
 */
export const SCHEME_CSS = [
  `:root{${declarationsFor('light')}}`,
  `:root[data-theme=dark]{${declarationsFor('dark')}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${declarationsFor('dark')}}}`,
  `:root,:root>body{background-color:${cssVariables('light').theme.semantic.color.surface}}`,
].join('\n');

/** The themes a learner can choose, which pin the scheme whatever the device says. */
const CHOSEN = THEMES.filter((theme) => theme !== 'system');

/**
 * A script that, before the first paint, sets <html data-theme> to the theme
 * the learner saved (read as settings.ts reads it), so SCHEME_CSS shows the
 * page in its colors, and the browser's bars to its color (barColor.ts).
 * System needs nothing. Later, AppTheme keeps it pinned (`pinTheme`). It also
 * sets <html data-side> to the side they saved, which turns the home page's
 * still board (src/components/savedSide.ts).
 */
export const PRE_PAINT_SCRIPT =
  `try{var s=JSON.parse(${readStorageScript(SETTINGS_KEY)}),t=s.theme,root=document.documentElement;` +
  `if(${JSON.stringify(COLORS)}.indexOf(s.side)>=0)root.dataset.side=s.side;` +
  `if(${JSON.stringify(CHOSEN)}.indexOf(t)>=0){root.dataset.theme=t;` +
  `${JSON.stringify(Object.values(BAR_IDS))}.forEach(function(i){var m=document.getElementById(i);if(m)m.content=${JSON.stringify(BAR_COLORS)}[t]})}}catch(e){}`;
