/**
 * Android's motion engine: Reanimated layout animations, which start in the
 * same frame React Native mounts the new layout. Animating from JavaScript
 * after a commit can't: Reanimated holds its updates back while React
 * commits, so the new layout shows for a frame before the animation's start.
 * Each view springs from where it is on screen to its new place on the UI
 * thread, with the web's spring and with the speed it had (Reanimated's own
 * springs drop velocity that points away from the target, so a reversal
 * would stall instead of turning around). A list only animates the change
 * its `layoutDependency` names: its views carry their layout animation in
 * that render alone (Reanimated takes the config with the commit; a shared
 * value written from JavaScript can arrive after the mount), so other layout
 * changes land at once.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  type AnimationObject,
  defineAnimation,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
  type SharedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { atRest, springAt, type Spring, type SpringState } from './spring';
import type { HostProps, ListMotion } from './types';

/** Sub-pixel: settles once the remaining motion is invisible */
const PRECISION = 0.25;

interface NativeListMotion extends ListMotion {
  readonly spring: Spring;
}

/** Where a view's spring on one axis started, to read its speed if interrupted */
interface Run {
  readonly start: SpringState;
  readonly startedAt: number;
}
type Runs = { x?: Run; y?: Run };

/** Nothing to do around a commit: each view's layout animation does the work */
export function useListMotion(spring: Spring): NativeListMotion {
  return useMemo(() => ({ spring, before: () => undefined, after: () => {} }), [spring]);
}

/**
 * An Animated.View whose layout changes and arrival its list animates. A
 * removed item goes at once: Reanimated keeps a view with an `exiting`
 * animation on screen for a frame or two even when that animation does
 * nothing, which drew old rows over new ones whenever a list's rows changed
 * outside an animated change.
 */
export function MotionHost({ join, list, animating, ...rest }: HostProps) {
  const runs = useSharedValue<Runs>({});
  const motion = list as NativeListMotion | null;
  const spring = motion?.spring;
  const layout = useMemo(() => spring && layoutTransition(spring, runs), [spring, runs]);
  // Read once, at mount: only an arrival fades in.
  const [entering] = useState(() => (animating && spring ? enterAnimation(spring) : undefined));
  if (!motion) return <View {...rest} ref={join as never} />;
  return (
    <Animated.View {...rest} ref={join as never} layout={layout || undefined} entering={entering} />
  );
}

/** Springs a view from where it is on screen to its new place, keeping its speed */
function layoutTransition(spring: Spring, runs: SharedValue<Runs>): LayoutAnimationFunction {
  return (values) => {
    'worklet';
    const size = { width: values.targetWidth, height: values.targetHeight };
    return {
      initialValues: { originX: values.currentOriginX, originY: values.currentOriginY, ...size },
      animations: {
        originX: springTo(values.targetOriginX, spring, runs, 'x'),
        originY: springTo(values.targetOriginY, spring, runs, 'y'),
      },
    };
  };
}

/** Fades an item in that arrived with the change */
function enterAnimation(spring: Spring): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return { initialValues: { opacity: 0 }, animations: { opacity: springTo(1, spring) } };
  };
}

/**
 * An animation from wherever the value is to `target` on `spring`. With
 * `runs`, it starts at the speed the axis's last spring had at that moment,
 * and records its own start for the next.
 */
function springTo(target: number, spring: Spring, runs?: SharedValue<Runs>, axis?: 'x' | 'y') {
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
        const done = atRest(state, PRECISION);
        animation.current = target + (done ? 0 : state.offset);
        return done;
      },
      current: target,
      toValue: target,
    };
  }) as unknown as number;
}
