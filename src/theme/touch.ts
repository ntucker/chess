import type { TextStyle } from 'react-native';

import './touch.css';

const WEB = process.env.EXPO_OS === 'web';

/**
 * The least size of something to tap on a touch screen: Android's 48 dp.
 * Silk's own controls reach 44 (Apple's size) through hitSlop, which can't
 * reach past a parent's bounds on Android, so the app grows layout instead.
 */
export const TOUCH_TARGET = 48;

/**
 * A control's least width and height, so a finger can hit it: TOUCH_TARGET
 * off the web, and on the web too under a finger (touch.css's media query);
 * none for a mouse. Typed as a number because React Native's types don't
 * know CSS variables; React Native Web passes the string through.
 */
export const touchTarget: number = WEB
  ? ('var(--touch-target, 0px)' as unknown as number)
  : TOUCH_TARGET;

/**
 * Padding on each side of something `content` long that makes it
 * `touchTarget` long, or `least` where that is more (a mouse's page). For
 * text, which can't center itself in a least height off the web, or for
 * controls in a row that should keep even gaps rather than each grow to
 * `touchTarget`. Example: a caption line's 16 px take 16 px above and below.
 */
export function touchPadding(content: number, least = 0): number {
  return WEB
    ? (`max(${least}px, (var(--touch-target, 0px) - ${content}px) / 2)` as unknown as number)
    : Math.max(least, (TOUCH_TARGET - content) / 2);
}

/**
 * The style that makes a line of text `lineHeight` tall at least
 * `touchTarget` tall, its text centered: padding on the web, and off it a
 * least height, since padding worked out for the text's own size would
 * squeeze the text out once Android's font size setting enlarges it inside a
 * parent no taller than the target (a phone's name bar).
 */
export function touchLine(lineHeight: number): TextStyle {
  return WEB
    ? { paddingVertical: touchPadding(lineHeight) }
    : { minHeight: TOUCH_TARGET, textAlignVertical: 'center' };
}

/**
 * `length` negated, for a margin that undoes a padding from `touchPadding`:
 * on the web a CSS length, so `calc` negates it.
 */
export function negated(length: number): number {
  return WEB ? (`calc(-1 * ${length})` as unknown as number) : -length;
}
