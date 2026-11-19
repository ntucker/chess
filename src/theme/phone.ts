import './phone.css';

/** The lengths phone.css shortens on a phone-width web page. */
export const PHONE_LENGTHS = [
  'page-space',
  'header-height',
  'wordmark-size',
  'player-bar-height',
  'wrapped-gap',
] as const;

/**
 * A length that is shorter on a phone-width web page, or a sum of such
 * lengths. Work them out with `plus`, `minus` and `times`, never with the
 * style value, so the web's CSS and the native number stay one expression.
 */
export interface PhoneLength {
  /** Its pixels on a wide screen, and everywhere off the web. */
  readonly wide: number;
  /** As CSS on the web: the phone's length, or `wide`. */
  readonly css: string;
  /** As a style value (see `phoneCalc` for its type). */
  readonly value: number;
  plus(other: PhoneLength | number): PhoneLength;
  minus(other: PhoneLength | number): PhoneLength;
  times(factor: number): PhoneLength;
}

/** The length `--<name>` in phone.css on a phone-width web page, `wide` pixels elsewhere. */
export function phoneLength(name: (typeof PHONE_LENGTHS)[number], wide: number) {
  return length(wide, `var(--${name}, ${wide}px)`);
}

function length(wide: number, css: string): PhoneLength {
  const of = (other: PhoneLength | number) =>
    typeof other === 'number' ? length(other, `${other}px`) : other;
  return {
    wide,
    css,
    value: phoneCalc(css, wide),
    plus: (other) => length(wide + of(other).wide, `(${css} + ${of(other).css})`),
    minus: (other) => length(wide - of(other).wide, `(${css} - ${of(other).css})`),
    times: (factor) => length(wide * factor, `(${css} * ${factor})`),
  };
}

/**
 * A style value: `calc(<css>)` on the web, `wide` elsewhere. Typed as a
 * number because React Native's types don't know CSS functions; React Native
 * Web passes the string through to CSS. Never do arithmetic on it.
 */
export function phoneCalc(css: string, wide: number): number {
  return process.env.EXPO_OS === 'web' ? (`calc(${css})` as unknown as number) : wide;
}

/** The style of what only a wide screen shows: hidden on a phone-width web page. */
export const wideOnly =
  process.env.EXPO_OS === 'web' ? { display: 'var(--wide-only, flex)' as 'flex' } : {};
