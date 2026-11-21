import {
  type ColorScheme,
  createTheme,
  generateScale,
  type SemanticTokens,
  type Theme,
} from '@reactive/silk-core';

/**
 * Opening Night's look: a theater at curtain-up. Dark mode is the stage
 * (velvet plum, lit by a gold spotlight); light mode is the printed program
 * (ivory paper, plum ink, curtain-red accents).
 */
const brand = {
  velvet: '#3b2d55',
  spotlight: '#d9a441',
  curtain: '#8f1b35',
} as const;

/** `hex` (#rrggbb) at `alpha` opacity, as a CSS color. */
const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
const pool = (hex: string, alpha: number) =>
  `radial-gradient(ellipse 70% 55% at 35% -5%, ${rgba(hex, alpha)}, ${rgba(hex, 0)} 70%)`;

/**
 * A soft pool of light from above the stage, as a CSS background image (drawn
 * on the web; native ignores it).
 */
const spotlight: Readonly<Record<ColorScheme, string>> = {
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
    surface: '#fbf7ef',
    surfaceRaised: '#fffdf8',
    surfaceSunken: '#f2eadb',
    textPrimary: '#221a33',
    textSecondary: '#675d76',
    borderSubtle: '#e3d9c6',
    // The veil behind a sheet: plum ink on the paper.
    overlay: rgba('#221a33', 0.42),
  },
  dark: {
    surface: '#120d1f',
    surfaceRaised: '#1c1530',
    surfaceSunken: '#0b0815',
    textPrimary: '#f4eee2',
    textSecondary: '#a99fbb',
    borderSubtle: '#2e2645',
    // The veil behind a sheet: the stage's darkness.
    overlay: rgba('#0b0815', 0.72),
  },
} as const;

// Plum ink on spotlight gold.
const darkTones = { accent: { onSolid: surfaces.dark.surface } };

// The generated grays are cool; the program's paper is warm, so its neutral
// fills are parchment, with plum ink for solid controls and ivory on red.
const lightTones = {
  accent: { onSolid: '#fffdf8' },
  neutral: {
    solid: surfaces.light.textPrimary,
    onSolid: '#fffdf8',
    text: surfaces.light.textPrimary,
    subtle: '#f1e8d7',
    subtleHover: '#eadfca',
    subtleActive: '#e2d4bb',
    border: '#cdbfa6',
    hover: '#3a2d52',
    active: '#4b3c68',
    disabledFg: '#9a90a6',
    disabledBg: '#eee6d6',
  },
  // Silk's green ring sits just under 3:1 on the warmer sunken paper.
  success: { focusRing: '#2b7a4b' },
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

/**
 * Colors the app picks or works out from a scheme's theme, which differ
 * between light and dark in ways Silk's tokens don't say. Read them with
 * `useSchemeColors` (shownTheme.ts).
 */
function buildSchemeColors(colorScheme: ColorScheme) {
  const { color } = themes[colorScheme].semantic;
  const { accent, neutral } = color.tones;
  const dark = colorScheme === 'dark';
  return {
    /** The page's pool of light from above the stage (Page.tsx). */
    spotlight: spotlight[colorScheme],
    /** The evaluation bar's edge: on the light page its white end needs a firmer one. */
    evaluationEdge: dark ? color.borderSubtle : neutral.border,
    /** The ending banner's ground (EndingCard.tsx), letting a little of the board through... */
    endingGroundWon: rgba(color.surfaceRaised, ENDING_GROUND_ALPHA),
    /** ...duller for a loss or a draw. */
    endingGroundPlain: rgba(color.surfaceSunken, ENDING_GROUND_ALPHA),
    /** A win's small type: the accent's text color, lighter than its solid on velvet. */
    endingEyebrowWon: dark ? accent.text : accent.solid,
    /** The sheen that sweeps across a win's banner. */
    endingGleam: rgba(dark ? color.textPrimary : accent.solid, dark ? 0.1 : 0.07),
  };
}

const ENDING_GROUND_ALPHA = 0.94;

export type SchemeColors = Readonly<ReturnType<typeof buildSchemeColors>>;

export const schemeColors: Readonly<Record<ColorScheme, SchemeColors>> = {
  light: buildSchemeColors('light'),
  dark: buildSchemeColors('dark'),
};
