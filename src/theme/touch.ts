import './touch.css';

const WEB = process.env.EXPO_OS === 'web';

/** The least size of something to tap on a touch screen: Android's 48 dp. */
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
