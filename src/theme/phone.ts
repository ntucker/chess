import './phone.css';

/** A length that phone.css shortens on a phone-width web page. */
export interface PhoneLength {
  /** Its pixels on a wide screen, and everywhere off the web. */
  readonly wide: number;
  /** As CSS on the web, for `phoneCalc`: the phone's length, or `wide`. */
  readonly css: string;
  /** As a style value (see `phoneCalc` for its type). */
  readonly value: number;
}

/** The length `--<name>` in phone.css on a phone-width web page, `wide` pixels elsewhere. */
export function phoneLength(
  name: 'page-space' | 'header-height' | 'wordmark-size' | 'player-bar-height' | 'wrapped-gap',
  wide: number,
): PhoneLength {
  const css = `var(--${name}, ${wide}px)`;
  return { wide, css, value: phoneCalc(css, wide) };
}

/**
 * A style value worked out from `PhoneLength`s: `calc(<css>)` on the web, and
 * the same sum of their `wide` values elsewhere. Typed as a number because
 * React Native's types don't know CSS functions; React Native Web passes the
 * string through to CSS.
 */
export function phoneCalc(css: string, wide: number): number {
  return process.env.EXPO_OS === 'web' ? (`calc(${css})` as unknown as number) : wide;
}

/** The style of what only a wide screen shows: hidden on a phone-width web page. */
export const wideOnly =
  process.env.EXPO_OS === 'web' ? { display: 'var(--wide-only, flex)' as 'flex' } : {};
