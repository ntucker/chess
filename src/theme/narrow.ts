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
  /** A row of the opponent's strength list, tall enough to tap (OpponentPicker.tsx). */
  'menu-row-height': 40,
  /** Space between the board column and the panel below it (Stage.tsx). */
  'wrapped-gap': 12,
  /** Space between the panel's sections (LessonScreen.tsx)... */
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
  /** A candidate row's compact spacing, in its narrow pane (CandidateList.tsx). */
  'candidate-gap': 8,
  'candidate-inset': 10,
  'candidate-padding': 6,
  /** The fade at the bottom of the panel and of each of its panes (`NarrowScroll`). */
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
  'player-names',
  'lesson-panel',
  'lesson-body',
  'scoresheet-drawer',
  'panes',
  'moves-pane',
  'idea-pane',
  'move-list',
  'list-card',
  'list-scroll',
  'leads-to',
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
  'list-scroll',
  'idea-pane',
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

/** How a part looks off the web: on each kind of page, and the props it takes on a narrow one. */
interface NativePart {
  readonly wide?: ViewStyle & TextStyle;
  readonly narrow?: ViewStyle & TextStyle;
  readonly narrowProps?: { readonly numberOfLines?: number };
}

/** The lesson panes' least height on a narrow page: a couple of moves. */
const PANES_FLOOR = 140;

/**
 * narrow.css's rules as native styles. narrow.test.ts checks each declaration
 * is in the part's rule there (`wide` in the rules outside the media query),
 * unless `NATIVE_ONLY` lists it, and each declaration there is here or in `CSS_ONLY`.
 *
 * A part that starts from zero length takes `flexBasis: 'auto'` and a zero
 * width or height, never `flexBasis: 0` (narrow.test.ts checks): React Native
 * keeps a node's flex basis from the page it was first laid out on when its
 * style changes, so the window crossing the narrow width left the panel a
 * strip beside the board, or the panes split unevenly. Yoga works out an
 * automatic basis afresh each time. Seen on React Native 0.88.1.
 */
export const NATIVE_PARTS: Readonly<Record<NarrowPartName, NativePart>> = {
  'wide-only': { narrow: { display: 'none' } },
  'wide-only-spoken': { narrow: visuallyHidden },
  'narrow-only': { wide: { display: 'none' } },
  place: { wide: { display: 'none' } },
  page: { narrow: { flexGrow: 1 } },
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
  program: {
    narrow: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      height: 0,
      minHeight: 120,
      width: '100%',
    },
  },
  'player-names': { narrow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 } },
  'lesson-panel': { narrow: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' } },
  'lesson-body': { narrow: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' } },
  'scoresheet-drawer': {
    wide: { display: 'none' },
    narrow: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', height: 0, minHeight: 0 },
  },
  panes: {
    narrow: {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 'auto',
      flexDirection: 'row',
      minHeight: PANES_FLOOR,
      height: PANES_FLOOR,
    },
  },
  'moves-pane': {
    narrow: {
      flexGrow: 2,
      flexShrink: 1,
      flexBasis: 'auto',
      width: 0,
      minWidth: 0,
      overflow: 'hidden',
    },
  },
  'idea-pane': { narrow: { flexGrow: 3, flexShrink: 1, flexBasis: 'auto', width: 0, minWidth: 0 } },
  'move-list': { narrow: { flexShrink: 1, minHeight: 0 } },
  'list-card': { narrow: { flexShrink: 1, minHeight: 0, paddingBottom: 0 } },
  'list-scroll': { narrow: { flexShrink: 1, minHeight: 0 } },
  'leads-to': { narrowProps: { numberOfLines: undefined } },
};

/**
 * Native styles with no rule in narrow.css, and why, so narrow.test.ts can
 * tell them from a declaration missing there.
 */
export const NATIVE_ONLY: Readonly<Partial<Record<NarrowPartName, readonly (keyof ViewStyle)[]>>> =
  {
    // The panes sit in the program's scroll view, where Yoga ignores a zero
    // height and would grow them to their content: a height at their floor is
    // the basis there instead. CSS keeps the zero height.
    panes: ['height'],
  };

/** What narrow.css does to a part that scrolls on its own: `NarrowScroll` does it natively. */
const SCROLLS = [
  'overflow-y: auto',
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
  // Unhidden as above; and native shows the drawer without its rise, or its fade for reduced motion.
  'scoresheet-drawer': [
    'display: flex',
    'animation: drawer-rise 220ms cubic-bezier(0.2, 0, 0, 1)',
    'animation-name: drawer-fade',
    'animation-duration: 120ms',
  ],
  // Natively the panel grows in its scroll view's content, which already fills the
  // program; a percentage there adds the fade's padding again, so the panel scrolled by it.
  'lesson-panel': ['min-height: 100%'],
  // Natively the panes' floor is their height instead (`NATIVE_ONLY`).
  panes: ['height: 0'],
  // Native's leads-to takes `narrowProps` instead.
  'leads-to': ['white-space: normal'],
  // `NarrowScroll` scrolls these natively, with a fading edge and the same padding.
  program: SCROLLS,
  'list-scroll': ['overscroll-behavior: contain', ...SCROLLS],
  'idea-pane': ['overscroll-behavior: contain', ...SCROLLS],
};
