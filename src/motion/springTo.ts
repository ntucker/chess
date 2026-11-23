import { type AnimationObject, defineAnimation, type SharedValue } from 'react-native-reanimated';

import { atRest, springAt, SUBPIXEL, type Spring, type SpringState } from './spring';

/** Where a view's spring on one axis started, to read its speed if interrupted */
interface Run {
  readonly start: SpringState;
  readonly startedAt: number;
}
export type Runs = { x?: Run; y?: Run };

/** How `springTo` keeps an axis's speed, and when it stops. */
interface SpringToOptions {
  /** With `axis`, the spring starts at the speed the axis's last spring had, and records its own start for the next. */
  readonly runs?: SharedValue<Runs>;
  readonly axis?: 'x' | 'y';
  /** How close to `target` (and how slow) it stops: by default under a pixel, for a value in pixels. */
  readonly precision?: number;
}

/** An animation from wherever the value is to `target` on `spring`. */
export function springTo(
  target: number,
  spring: Spring,
  { runs, axis, precision = SUBPIXEL }: SpringToOptions = {},
) {
  'worklet';
  return defineAnimation<AnimationObject<number>>(target, () => {
    'worklet';
    return {
      onStart(animation: AnimationObject<number>, value: number, now: number) {
        const last = runs && axis ? runs.value[axis] : undefined;
        const velocity = last
          ? springAt(spring, last.start, (now - last.startedAt) / 1000).velocity
          : 0;
        const start = { offset: value - target, velocity };
        animation.start = start;
        animation.startTime = now;
        animation.current = value;
        if (runs && axis) runs.value = { ...runs.value, [axis]: { start, startedAt: now } };
      },
      onFrame(animation: AnimationObject<number>, now: number) {
        const state = springAt(spring, animation.start, (now - animation.startTime) / 1000);
        const done = atRest(state, precision);
        animation.current = target + (done ? 0 : state.offset);
        return done;
      },
      current: target,
      toValue: target,
    };
  }) as unknown as number;
}
