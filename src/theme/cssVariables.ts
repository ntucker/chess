import type { ColorScheme, Theme } from '@reactive/silk-core';

import { type SchemeColors, schemeColors, themes } from './theme';

// The web pre-renders every page before it knows the learner's colors. So on
// the web every color is a CSS variable, which the page's head sets per scheme
// (schemeCss.ts) before its first paint: the scheme lives only in
// <html data-theme> and the device's setting, never in a color string.

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

/**
 * A scheme's theme and scheme colors (named `--chess-…`, so they can't clash
 * with variables Silk may write one day) with every color a CSS variable, which
 * read the same in both schemes, and each variable's value in this one. The
 * theme keeps its scheme's other tokens (its `colorScheme`, its shadows).
 */
export function cssVariables(colorScheme: ColorScheme) {
  const declarations = new Map<string, string>();
  const theme = themes[colorScheme];
  const color = toVariables(theme.semantic.color, '--chess-color', declarations);
  return {
    theme: { ...theme, semantic: { ...theme.semantic, color } } satisfies Theme,
    schemeColors: toVariables<SchemeColors>(
      schemeColors[colorScheme],
      '--chess-scheme',
      declarations,
    ),
    declarations,
  };
}
