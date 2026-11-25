import { useReducedMotion } from '@reactive/silk-native';

import { springMotion, type Spring } from '@/motion/spring';
import { timingFunction } from '@/theme/timingFunction';

/**
 * The timing of a Reanimated CSS transition played on `spring`
 * (`springMotion`), to spread beside its `transitionProperty`: instant
 * when the device asks for reduced motion.
 */
export function useSpringTransition(spring: Spring) {
  const reducedMotion = useReducedMotion();
  const { durationMs, easing } = springMotion(spring);
  return {
    transitionDuration: reducedMotion ? 0 : durationMs,
    transitionTimingFunction: timingFunction(easing),
  };
}
