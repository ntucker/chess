import { type CSSAnimationTimingFunction, cubicBezier, linear } from 'react-native-reanimated';

/**
 * A CSS easing (a theme's motion token, or `springMotion`'s) as a Reanimated
 * timing function. Reanimated takes the named curves as strings, but
 * `cubic-bezier(...)` and `linear(...)` only as its own objects. Its
 * transitions take the same type (`CSSTransitionTimingFunction`).
 */
export function timingFunction(easing: string): CSSAnimationTimingFunction {
  // A spring's linear() easing is dozens of samples long and read on every render.
  let parsed = PARSED.get(easing);
  if (!parsed) PARSED.set(easing, (parsed = parse(easing)));
  return parsed;
}

const PARSED = new Map<string, CSSAnimationTimingFunction>();

function parse(easing: string): CSSAnimationTimingFunction {
  const call = /^(cubic-bezier|linear)\((.*)\)$/.exec(easing);
  if (!call) return easing as CSSAnimationTimingFunction;
  const numbers = call[2].split(',').map(Number);
  if (call[1] === 'linear') return linear(...numbers);
  const [x1, y1, x2, y2] = numbers;
  return cubicBezier(x1, y1, x2, y2);
}
