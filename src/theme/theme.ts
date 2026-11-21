import {
  type ColorScheme,
  createTheme,
  generateScale,
  oklch,
  type SemanticTokens,
  type Theme,
} from '@reactive/silk-core';

/**
 * Opening Night's look: a theater at curtain-up. Dark mode is the stage
 * (velvet plum, lit by a gold spotlight); light mode is the printed program
 * (ivory paper, plum ink, curtain-red accents).
 */
const brand = {
  velvet: oklch(0.332, 0.07, 299),
  spotlight: oklch(0.751, 0.1295, 79.8),
  curtain: oklch(0.429, 0.15, 14.3),
} as const;

/** `hex` (#rrggbb) at `alpha` opacity, as a CSS color. */
export const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
const pool = (hex: string, alpha: number) =>
  `radial-gradient(ellipse 70% 55% at 35% -5%, ${rgba(hex, alpha)}, ${rgba(hex, 0)} 70%)`;

/**
 * A soft pool of light from above the stage, as a CSS background image (drawn
 * on the web; native ignores it).
 */
export const spotlight: Readonly<Record<ColorScheme, string>> = {
  dark: pool(brand.spotlight, 0.22),
  light: pool(brand.curtain, 0.09),
};

/** Font files loaded at startup (see src/app/_layout.tsx), by family name. */
export const fonts = {
  /** Display serif for headlines and the wordmark. Has one weight. */
  display: 'DMSerifDisplay_400Regular',
  displayItalic: 'DMSerifDisplay_400Regular_Italic',
  /** Text and controls. */
  text: 'InstrumentSans_400Regular',
  /** Move numbers and notation. */
  mono: 'DMMono_400Regular',
} as const;

// Silk picks a font by family slot (sans, serif, mono) and a weight, but each
// loaded file is its own family on Android, so a weight the file
// doesn't have would be ignored there and faked on the web. Every role uses
// its file's own weight instead; the display serif carries the hierarchy.
export const typography: SemanticTokens['typography'] = {
  body: { family: 'sans', size: 16, lineHeight: 1.5, weight: 400 },
  bodySm: { family: 'sans', size: 14, lineHeight: 1.45, weight: 400 },
  headingSm: { family: 'serif', size: 18, lineHeight: 1.3, weight: 400 },
  heading: { family: 'serif', size: 24, lineHeight: 1.2, weight: 400 },
  headingLg: { family: 'serif', size: 32, lineHeight: 1.15, weight: 400 },
  headingXl: { family: 'serif', size: 44, lineHeight: 1.05, weight: 400 },
  label: { family: 'sans', size: 13, lineHeight: 1.3, weight: 400 },
  caption: { family: 'sans', size: 12, lineHeight: 1.35, weight: 400 },
};

/** A text role's line height in pixels, as Silk sets it. */
export const lineHeightOf = (role: keyof typeof typography) =>
  typography[role].size * typography[role].lineHeight;

const fontFamily: SemanticTokens['fontFamily'] = {
  sans: `${fonts.text}, system-ui, sans-serif`,
  serif: `${fonts.display}, Georgia, serif`,
  mono: `${fonts.mono}, ui-monospace, monospace`,
};

const surfaces = {
  light: {
    surface: oklch(0.977, 0.011, 85),
    surfaceRaised: oklch(0.994, 0.007, 89),
    surfaceSunken: oklch(0.939, 0.022, 83),
    textPrimary: oklch(0.24, 0.048, 297),
    textSecondary: oklch(0.497, 0.041, 303),
    borderSubtle: oklch(0.888, 0.028, 84),
    // The veil behind a sheet: plum ink on the paper.
    overlay: oklch(0.24, 0.048, 297, 0.42),
  },
  dark: {
    surface: oklch(0.176, 0.037, 295),
    surfaceRaised: oklch(0.22, 0.052, 294),
    surfaceSunken: oklch(0.146, 0.028, 294),
    textPrimary: oklch(0.951, 0.017, 85),
    textSecondary: oklch(0.72, 0.042, 302),
    borderSubtle: oklch(0.293, 0.056, 295),
    // The veil behind a sheet: the stage's darkness.
    overlay: oklch(0.146, 0.028, 294, 0.72),
  },
} as const;

// Plum ink on spotlight gold.
const darkTones = { accent: { onSolid: surfaces.dark.surface } };

// The generated grays are cool; the program's paper is warm, so its neutral
// fills are parchment, with plum ink for solid controls and ivory on red.
const lightTones = {
  accent: { onSolid: oklch(0.994, 0.007, 89) },
  neutral: {
    solid: surfaces.light.textPrimary,
    onSolid: oklch(0.994, 0.007, 89),
    text: surfaces.light.textPrimary,
    subtle: oklch(0.934, 0.025, 83),
    subtleHover: oklch(0.907, 0.03, 84),
    subtleActive: oklch(0.875, 0.037, 82),
    border: oklch(0.81, 0.038, 82),
    hover: oklch(0.33, 0.065, 299),
    active: oklch(0.392, 0.074, 299),
    disabledFg: oklch(0.669, 0.034, 306),
    disabledBg: oklch(0.927, 0.023, 85),
  },
  // Silk's green ring sits just under 3:1 on the warmer sunken paper.
  success: { focusRing: oklch(0.518, 0.107, 154) },
};

function buildTheme(colorScheme: ColorScheme): Theme {
  const dark = colorScheme === 'dark';
  return createTheme({
    colorScheme,
    palette: {
      gray: generateScale(brand.velvet, colorScheme, { chromaCap: dark ? 0.05 : 0.03 }),
      // Silk's accent tone reads the blue scale.
      blue: generateScale(dark ? brand.spotlight : brand.curtain, colorScheme),
    },
    semantic: {
      color: {
        ...surfaces[colorScheme],
        tones: dark ? darkTones : lightTones,
      },
      fontFamily,
      typography,
      radius: { sm: 6, md: 10, lg: 16 },
      shadow: {
        raised: { offsetY: 10, blur: 30, opacity: dark ? 0.45 : 0.1 },
        // The board, lifted off the stage.
        overlay: { offsetY: 14, blur: 56, opacity: 0.35 },
      },
    },
  });
}

export const themes: Readonly<Record<ColorScheme, Theme>> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
};
