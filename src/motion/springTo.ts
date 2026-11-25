import { type AnimationObject, defineAnimation } from 'react-native-reanimated';

import { atRest, springAt, SUBPIXEL, type Spring } from './spring';

/** When `springTo` stops. */
interface SpringToOptions {
  /** How close to `target` (and how slow) it stops: by default under a pixel, for a value in pixels. */
  readonly precision?: number;
}

/** An animation from wherever the value is to `target` on `spring`. */
export function springTo(target: number, spring: Spring, { precision }: SpringToOptions = {}) {
  'worklet';
  return defineAnimation<AnimationObject<number>>(target, () => {
    'worklet';
    return {
      onStart(animation: AnimationObject<number>, value: number, now: number) {
        animation.start = { offset: value - target, velocity: 0 };
        animation.startTime = now;
        animation.current = value;
      },
      onFrame(animation: AnimationObject<number>, now: number) {
        const state = springAt(spring, animation.start, (now - animation.startTime) / 1000);
        // Resolved here, never as a parameter default: on the UI thread a worklet
        // binds what it captured in its body, after its defaults run.
        const done = atRest(state, precision ?? SUBPIXEL);
        animation.current = target + (done ? 0 : state.offset);
        return done;
      },
      current: target,
      toValue: target,
    };
  }) as unknown as number;
}
