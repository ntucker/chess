import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import './narrow.css';

/**
 * Whether narrow.css can apply: only on the web, where it decides a narrow
 * page by a media query. Off the web, `Narrow.tsx` decides it from the
 * room the page has and applies the same lengths and parts as styles.
 */
export const NARROW_CSS_LOADS = process.env.EXPO_OS === 'web';

/**
 * Each length a narrow page shortens, and its pixels there. narrow.css sets
 * each one as `--<name>` (narrow.test.ts checks they agree), and native styles
 * read them from here.
 */
export const NARROW_PX = {
  /** Page padding and the gap below the header (Page.tsx). */
  'page-space': 10,
  /** The header's height (Header.tsx): the logo, as tall as the round buttons beside it (HeaderButton.tsx). */
  'header-height': 28,
  'header-button-size': 28,
  'wordmark-size': 18,
  /**
   * The name bars above and below the board (Stage.tsx): the one with the
   * move stepper as tall as the stepper, the other one line of names.
   */
  'controls-bar-height': 48,
  'names-bar-height': 32,
  /**
   * The player's disc becomes a dot, and the evaluation bar beside the board
   * a thin strip, to give the board their width (Stage.tsx).
   */
  'player-disc': 10,
  'player-disc-gap': 6,
  'player-disc-border': 2,
  'evaluation-width': 6,
  /**
   * A panel's full headline (GameStatus.tsx), down from theme.ts's headingLg,
   * as free play's; the lesson's draws one short line instead.
   */
  'headline-size': 20,
  /** Space between the board column and the panel below it (Stage.tsx). */
  'wrapped-gap': 12,
  /** Space between the panel's sections (Eyebrow.tsx)... */
  'section-gap': 12,
  /** ...and between a section's label and what it labels (Eyebrow.tsx). */
  'label-gap': 6,
  /**
   * In a short window the board shrinks, down to this (Stage.tsx), wide enough
   * for the player's name bar to fit its status beside the move buttons...
   */
  'board-min': 300,
  /** ...to leave this much for the panel (a label and a couple of moves) and the gap above it. */
  'panel-reserve': 172,
  /** The review's actions fixed under its panel (Stage.tsx), a thumb's height, and the gap above them. */
  'program-foot': 60,
  /** Space between a side's openings in the opening list (OpeningList.tsx): a closed one is a single row, so a phone packs them close. */
  'opening-gap': 4,
  /** The fade at the bottom of the panel (`NarrowScroll`), and of a pane that scrolls in it (`FadingScroll`, both in Narrow.tsx). */
  fade: 16,
} as const;

/** A length's name in narrow.css. */
type NarrowName = keyof typeof NARROW_PX;

/**
 * The parts of the page a narrow page lays out differently. Each is a rule in
 * narrow.css and an entry of `NATIVE_PARTS`.
 */
export const NARROW_PARTS = [
  'wide-only',
  'wide-only-spoken',
  'narrow-only',
  'place',
  'page',
  'stage',
  'board-column',
  'program',
  'footed-program',
  'player-names',
  'pages-panel',
] as const;

/** A part of the page, as narrow.css names it. */
export type NarrowPartName = (typeof NARROW_PARTS)[number];

/**
 * The parts that scroll on their own on a narrow page. Only `NarrowScroll`
 * names them, as natively it must be a scroll view (narrow.test.ts checks
 * that these, and only these, scroll in narrow.css).
 */
export const SCROLLING_PARTS = [
  'program',
  'footed-program',
] as const satisfies readonly NarrowPartName[];

export type ScrollingPart = (typeof SCROLLING_PARTS)[number];

/**
 * A length that is shorter on a narrow page, or a sum of such lengths. Work
 * them out with `plus`, `minus` and `times`, never with a style value, so the
 * web's CSS and the native numbers stay one expression. Read it as a style
 * value only through `narrowStyles`' `px`.
 */
export interface NarrowLength {
  /** Its pixels on a wide page. */
  readonly wide: number;
  /** Its pixels on a narrow page. */
  readonly narrow: number;
  /** As CSS on the web: the narrow page's length, or `wide`. */
  readonly css: string;
  plus(other: NarrowLength | number): NarrowLength;
  minus(other: NarrowLength | number): NarrowLength;
  times(factor: number): NarrowLength;
}

/** The length `--<name>` from narrow.css on a narrow page, and `wide` pixels elsewhere. */
export function narrowLength(name: NarrowName, wide: number) {
  return makeLength(wide, NARROW_PX[name], `var(--${name}, ${wide}px)`);
}

function makeLength(wide: number, narrow: number, css: string): NarrowLength {
  return {
    wide,
    narrow,
    css,
    plus: (other) => {
      const operand = asLength(other);
      return makeLength(wide + operand.wide, narrow + operand.narrow, `(${css} + ${operand.css})`);
    },
    minus: (other) => {
      const operand = asLength(other);
      return makeLength(wide - operand.wide, narrow - operand.narrow, `(${css} - ${operand.css})`);
    },
    times: (factor) => makeLength(wide * factor, narrow * factor, `(${css} * ${factor})`),
  };
}

/** A fixed number of pixels, as a NarrowLength. */
function asLength(other: NarrowLength | number) {
  return typeof other === 'number' ? makeLength(other, other, `${other}px`) : other;
}

/**
 * A style value: `calc(<css>)` on the web, `native` elsewhere. Typed as a
 * number because React Native's types don't know CSS functions; React Native
 * Web passes the string through to CSS. Never do arithmetic on it.
 */
export function narrowCalc(css: string, native: number): number {
  return NARROW_CSS_LOADS ? (`calc(${css})` as unknown as number) : native;
}

/** A length as a style value, on one kind of page. */
export type Px = (length: NarrowLength) => number;

/** A length's pixels on each kind of page, off the web. */
export const PX: Readonly<Record<'wide' | 'narrow', Px>> = {
  wide: ({ wide }) => wide,
  narrow: ({ narrow }) => narrow,
};

/** Styles a component builds from narrow lengths, for a wide and a narrow page. */
export interface NarrowStyles<T> {
  readonly wide: T;
  readonly narrow: T;
}

/**
 * A component's styles, built from narrow lengths by `build`, which reads each
 * through `px`. On the web it builds them once, from the lengths' CSS, which
 * narrow.css resolves, so both kinds of page share them. Elsewhere it builds
 * them twice, once with each kind's pixels; `useNarrowStyles` picks one.
 * Its styles set no `flexBasis` (the compiler checks), as a style here may
 * differ between the two kinds of page and a basis that changes goes stale
 * natively (`NATIVE_PARTS` says why): start from a width or height. `flex: 1`
 * is fine, as its basis is 0 on both.
 */
export function narrowStyles<
  T extends Parameters<typeof StyleSheet.create>[0] & Record<string, { flexBasis?: never }>,
>(build: (px: Px) => T): NarrowStyles<Readonly<T>> {
  if (NARROW_CSS_LOADS) {
    const styles = StyleSheet.create(build(({ css, wide }) => narrowCalc(css, wide)));
    return { wide: styles, narrow: styles };
  }
  return { wide: StyleSheet.create(build(PX.wide)), narrow: StyleSheet.create(build(PX.narrow)) };
}

/** Out of sight, but still read by screen readers. */
export const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
} as const satisfies ViewStyle;

/** Out of sight and out of layout, but read by screen readers. */
export const spokenOnly = { ...visuallyHidden, opacity: 0 } as const satisfies ViewStyle;

/** How a part looks off the web, on each kind of page. */
interface NativePart {
  readonly wide?: ViewStyle & TextStyle;
  readonly narrow?: ViewStyle & TextStyle;
}

/**
 * The panel's least height under the board on a narrow page, with any
 * controls fixed under it (Stage's `programFoot`): a few lines of it.
 * narrow.css's `program` and `footed-program` write it too.
 */
export const PROGRAM_FLOOR = 120;

/** The panel under the board on a narrow page, short of its floor. */
const PROGRAM = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 'auto',
  height: 0,
  width: '100%',
} as const satisfies ViewStyle;

/**
 * narrow.css's rules as native styles. narrow.test.ts checks each declaration
 * is in the part's rule there (`wide` in the rules outside the media query),
 * and each declaration there is here or in `CSS_ONLY`.
 *
 * A part that starts from zero length takes `flexBasis: 'auto'` and a zero
 * width or height, never `flexBasis: 0` (narrow.test.ts checks): React Native
 * keeps a node's flex basis from the page it was first laid out on when its
 * style changes, so the window crossing the narrow width left the panel a
 * strip beside the board. Yoga works out an
 * automatic basis afresh each time. Seen on React Native 0.88.1.
 */
export const NATIVE_PARTS: Readonly<Record<NarrowPartName, NativePart>> = {
  'wide-only': { narrow: { display: 'none' } },
  'wide-only-spoken': { narrow: visuallyHidden },
  'narrow-only': { wide: { display: 'none' } },
  place: { wide: { display: 'none' } },
  // Page.tsx grows every page to the window, for its footer; only the web needs the height (CSS_ONLY).
  page: {},
  stage: {
    narrow: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      flexDirection: 'column',
      alignItems: 'center',
    },
  },
  'board-column': { narrow: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' } },
  program: { narrow: { ...PROGRAM, minHeight: PROGRAM_FLOOR } },
  // The controls under it take the rest of the floor, so they fit any window a page without them does.
  'footed-program': {
    narrow: { ...PROGRAM, minHeight: PROGRAM_FLOOR - NARROW_PX['program-foot'] },
  },
  'player-names': { narrow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 } },
  'pages-panel': { narrow: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' } },
};

/**
 * What narrow.css does to a part that scrolls on its own: `NarrowScroll` does
 * it natively, where a scroll view pans only along its axis already.
 */
const SCROLLS = [
  'overflow-x: hidden',
  'overflow-y: auto',
  'touch-action: pan-y pinch-zoom',
  'padding-bottom: var(--fade)',
  'mask-image: linear-gradient(to bottom, black calc(100% - var(--fade)), transparent)',
];

/**
 * narrow.css's declarations with no native style, and why, so a new rule
 * there fails narrow.test.ts until it has a native decision.
 */
export const CSS_ONLY: Readonly<Partial<Record<NarrowPartName, readonly string[]>>> = {
  // A native element doesn't need unhiding: its narrow style replaces its wide one.
  'narrow-only': ['display: block'],
  // Unhidden as above; native fits the place's name with adjustsFontSizeToFit (Header.tsx).
  place: ['display: flex', 'container-type: inline-size'],
  // Clips a hidden text's last pixel on the web; a native 1 by 1 view clips it already.
  'wide-only-spoken': ['clip-path: inset(50%)', 'white-space: nowrap'],
  // Natively Page.tsx gives a narrow board page its height (`useNarrowPageHeight`).
  page: ['min-height: 100dvh'],
  // Natively the panel grows in its scroll view's content, which already fills the
  // program; a percentage there adds the fade's padding again, so the panel scrolled by it.
  'pages-panel': ['min-height: 100%'],
  // `NarrowScroll` scrolls these natively, with a fading edge and the same padding.
  program: SCROLLS,
  'footed-program': SCROLLS,
};
