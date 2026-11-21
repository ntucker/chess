import type { ColorScheme, Theme } from '@reactive/silk-core';

import { storageKey } from '@/context/storage';
import { THEMES } from '@/settings/settings';

import { SCHEME_VALUES, type SchemeColorName, schemeVariable } from './schemeColors';
import { themes } from './theme';

// The web pre-renders every page before it knows the learner's colors. So on
// the web every color the theme gives is a CSS variable, which the page's head
// sets per scheme (src/app/+html.tsx) before its first paint: the scheme lives
// only in <html data-theme> and the device's setting, never in a color string.

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * `colors` (an object of colors, or of more such objects) with each color
 * replaced by `var(--<prefix>-<path>)`, and each variable's value added to
 * `declarations`.
 */
function toVariables<T extends object>(
  colors: T,
  prefix: string,
  declarations: Map<string, string>,
): T {
  const entries = Object.entries(colors).map(([key, value]: [string, unknown]) => {
    const name = `${prefix}-${kebab(key)}`;
    if (typeof value !== 'string') return [key, toVariables(value as object, name, declarations)];
    declarations.set(name, value);
    return [key, `var(${name})`];
  });
  return Object.fromEntries(entries) as T;
}

/** `theme` with its colors as CSS variables, and each variable's value in it. */
function cssTheme(theme: Theme) {
  const declarations = new Map<string, string>();
  const color = toVariables(theme.semantic.color, '--silk-color', declarations);
  for (const [name, value] of Object.entries(SCHEME_VALUES[theme.colorScheme])) {
    declarations.set(schemeVariable(name as SchemeColorName), value);
  }
  return {
    theme: { ...theme, semantic: { ...theme.semantic, color } },
    declarations,
  };
}

const css = { light: cssTheme(themes.light), dark: cssTheme(themes.dark) };

/**
 * The themes the web shows: `themes`, with every color a CSS variable. Each
 * keeps its scheme and shadows, which are the same until hydration, when the
 * device's scheme is known.
 */
export const cssThemes: Readonly<Record<ColorScheme, Theme>> = {
  light: css.light.theme,
  dark: css.dark.theme,
};

/** The themes this platform shows: `cssThemes` on the web, `themes` elsewhere. */
export const shownThemes = process.env.EXPO_OS === 'web' ? cssThemes : themes;

const block = (colorScheme: ColorScheme) =>
  [`color-scheme:${colorScheme}`, ...[...css[colorScheme].declarations].map((d) => d.join(':'))]
    .join(';')
    .concat(';');

/**
 * The variables' values: light, or dark when the learner chose Dark, or chose
 * nothing (System) on a dark device. The page behind the app takes the stage's color.
 */
export const SCHEME_CSS = [
  `:root{${block('light')}}`,
  `:root[data-theme=dark]{${block('dark')}}`,
  `@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${block('dark')}}}`,
  'html,body{background-color:var(--silk-color-surface)}',
].join('\n');

/** The themes a learner can choose, which pin the scheme whatever the device says. */
const CHOSEN = THEMES.filter((theme) => theme !== 'system');

/** `value` as a JavaScript literal that can sit inside a <script>. */
const literal = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/**
 * A script for the page's head that, before the first paint, sets
 * <html data-theme> to the theme the learner saved (read as settings.ts reads
 * it), so SCHEME_CSS shows the page in its colors. System needs nothing.
 */
export const PRE_PAINT_SCRIPT =
  `try{var t=JSON.parse(localStorage.getItem(${literal(storageKey('settings'))})).theme;` +
  `if(${literal(CHOSEN)}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}`;

/**
 * Pins <html data-theme> to `theme` once the page runs, so SCHEME_CSS follows
 * the learner's later choices too.
 */
export function setDocumentTheme(theme: (typeof THEMES)[number]) {
  const { dataset } = document.documentElement;
  if (theme === 'system') delete dataset.theme;
  else dataset.theme = theme;
}
