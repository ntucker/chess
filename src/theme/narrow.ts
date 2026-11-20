import './narrow.css';

/**
 * Whether narrow.css can apply: only on the web. Off it every length is its
 * wide value, no part is tagged, and text that only a narrow page shows isn't
 * rendered at all.
 */
export const NARROW_CSS_LOADS = process.env.EXPO_OS === 'web';

/** The lengths narrow.css shortens. */
export const NARROW_LENGTHS = [
  'page-space',
  'header-height',
  'wordmark-size',
  'controls-bar-height',
  'names-bar-height',
  'player-disc',
  'player-disc-gap',
  'player-disc-border',
  'evaluation-width',
  'headline-size',
  'wrapped-gap',
  'board-min',
  'source-link-size',
  'panel-reserve',
  'section-gap',
  'label-gap',
] as const;

/** The parts of the page that narrow.css lays out differently. */
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
  'lone-verdict',
  'lesson-panel',
  'panes',
  'moves-pane',
  'idea-pane',
  'compact-list',
  'candidate-row',
  'share-track',
  'leads-to',
] as const;

/**
 * A length that is shorter on a narrow web page, or a sum of such
 * lengths. Work them out with `plus`, `minus` and `times`, never with the
 * style value, so the web's CSS and the native number stay one expression.
 */
export interface NarrowLength {
  /** Its pixels on a wide screen, and everywhere off the web. */
  readonly wide: number;
  /** As CSS on the web: the narrow page's length, or `wide`. */
  readonly css: string;
  /** As a style value (see `narrowCalc` for its type). */
  readonly value: number;
  plus(other: NarrowLength | number): NarrowLength;
  minus(other: NarrowLength | number): NarrowLength;
  times(factor: number): NarrowLength;
}

/** The length `--<name>` from narrow.css, or `wide` pixels where it isn't set. */
export function narrowLength(name: (typeof NARROW_LENGTHS)[number], wide: number) {
  return makeLength(wide, `var(--${name}, ${wide}px)`);
}

function makeLength(wide: number, css: string): NarrowLength {
  return {
    wide,
    css,
    value: narrowCalc(css, wide),
    plus: (other) => {
      const operand = asLength(other);
      return makeLength(wide + operand.wide, `(${css} + ${operand.css})`);
    },
    minus: (other) => {
      const operand = asLength(other);
      return makeLength(wide - operand.wide, `(${css} - ${operand.css})`);
    },
    times: (factor) => makeLength(wide * factor, `(${css} * ${factor})`),
  };
}

/** A fixed number of pixels, as a NarrowLength. */
function asLength(other: NarrowLength | number) {
  return typeof other === 'number' ? makeLength(other, `${other}px`) : other;
}

/**
 * A style value: `calc(<css>)` on the web, `wide` elsewhere. Typed as a
 * number because React Native's types don't know CSS functions; React Native
 * Web passes the string through to CSS. Never do arithmetic on it.
 */
export function narrowCalc(css: string, wide: number): number {
  return NARROW_CSS_LOADS ? (`calc(${css})` as unknown as number) : wide;
}

/**
 * Props that name a part of the page for narrow.css to lay out. Nothing off
 * the web.
 */
export function narrowPart(part: (typeof NARROW_PARTS)[number]) {
  return NARROW_CSS_LOADS ? { dataSet: { narrow: part } } : {};
}
