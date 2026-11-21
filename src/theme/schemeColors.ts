import type { ColorScheme } from '@reactive/silk-core';
import { useTheme } from '@reactive/silk-native';

import { rgba, spotlight, themes } from './theme';

const WEB = process.env.EXPO_OS === 'web';

/**
 * Colors the app picks or works out from the theme's, which differ between
 * light and dark in ways Silk's tokens don't say.
 */
function schemeValues(colorScheme: ColorScheme) {
  const { color } = themes[colorScheme].semantic;
  const { accent, neutral } = color.tones;
  const dark = colorScheme === 'dark';
  return {
    /** The page's pool of light from above the stage (Page.tsx). */
    spotlight: spotlight[colorScheme],
    /** The evaluation bar's edge: on the light page its white end needs a firmer one. */
    'evaluation-edge': dark ? color.borderSubtle : neutral.border,
    /** The ending banner's ground (EndingCard.tsx), letting a little of the board through... */
    'ending-ground-won': rgba(color.surfaceRaised, ENDING_GROUND_ALPHA),
    /** ...duller for a loss or a draw. */
    'ending-ground-plain': rgba(color.surfaceSunken, ENDING_GROUND_ALPHA),
    /** A win's small type: the accent's text color, lighter than its solid on velvet. */
    'ending-eyebrow-won': dark ? accent.text : accent.solid,
    /** The sheen that sweeps across a win's banner. */
    'ending-gleam': rgba(dark ? color.textPrimary : accent.solid, dark ? 0.1 : 0.07),
  };
}

const ENDING_GROUND_ALPHA = 0.94;

export type SchemeColorName = keyof ReturnType<typeof schemeValues>;
export type SchemeColors = Readonly<Record<SchemeColorName, string>>;

/** Each scheme color's value, in each scheme. */
export const SCHEME_VALUES: Readonly<Record<ColorScheme, SchemeColors>> = {
  light: schemeValues('light'),
  dark: schemeValues('dark'),
};

/** A scheme color's CSS variable (declared by schemeCss.ts). */
export const schemeVariable = (name: SchemeColorName) => `--scheme-${name}`;

/** On the web, every scheme color as its CSS variable, the same in both schemes. */
const WEB_COLORS = Object.fromEntries(
  Object.keys(SCHEME_VALUES.light).map((name) => [
    name,
    `var(${schemeVariable(name as SchemeColorName)})`,
  ]),
) as SchemeColors;

/**
 * The scheme colors for the theme shown. On the web they are CSS variables,
 * like the theme's own colors (AppTheme.tsx), so never compute with them.
 */
export function useSchemeColors(): SchemeColors {
  const { theme } = useTheme();
  return WEB ? WEB_COLORS : SCHEME_VALUES[theme.colorScheme];
}
