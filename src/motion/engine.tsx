/**
 * Android's motion engine: Reanimated layout animations, which start in the
 * same frame React Native mounts the new layout. Animating from JavaScript
 * after a commit can't: Reanimated holds its updates back while React
 * commits, so the new layout shows for a frame before the animation's start.
 * Each view springs from where it is on screen to its new place on the UI
 * thread, with the web's spring and with the speed it had (Reanimated's own
 * springs drop velocity that points away from the target, so a reversal
 * would stall instead of turning around). A list only animates the change
 * its `layoutDependency` names: it arms its views before React commits and
 * disarms them a frame later, so other layout changes land at once.
 */
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  type AnimationObject,
  defineAnimation,
  Easing,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { atRest, springAt, type Spring, type SpringState } from './spring';
import type { HostProps, ListMotion } from './types';

/** Sub-pixel: settles once the remaining motion is invisible */
const PRECISION = 0.25;

interface NativeListMotion extends ListMotion {
  /** Its views animate the layout change React is committing */
  readonly armed: SharedValue<boolean>;
  readonly spring: Spring;
}

/** Where a view's spring on one axis started, to read its speed if interrupted */
interface Run {
  readonly start: SpringState;
  readonly startedAt: number;
}
type Runs = { x?: Run; y?: Run };

export function useListMotion(spring: Spring): NativeListMotion {
  const armed = useSharedValue(false);
  const changes = useRef(0);
  return useMemo(
    () => ({
      armed,
      spring,
      before() {
        changes.current += 1;
        armed.set(true);
        return changes.current;
      },
      after(change) {
        // After the UI thread has mounted this commit; a later change keeps it armed.
        requestAnimationFrame(() => {
          if (changes.current === change) armed.set(false);
        });
      },
    }),
    [armed, spring],
  );
}

/** An Animated.View whose layout changes, arrival and leaving its list animates */
export function MotionHost({ join, list, arriving, ...rest }: HostProps) {
  const runs = useSharedValue<Runs>({});
  const motion = list as NativeListMotion | null;
  const armed = motion?.armed;
  const spring = motion?.spring;
  const layout = useMemo(
    () => armed && spring && layoutTransition(armed, spring, runs),
    [armed, spring, runs],
  );
  const exiting = useMemo(() => armed && leaveAnimation(armed), [armed]);
  // Read once, at mount: only an arrival fades in.
  const [entering] = useState(() => (arriving && spring ? enterAnimation(spring) : undefined));
  if (!motion) return <View {...rest} ref={join as never} />;
  return (
    <Animated.View
      {...rest}
      ref={join as never}
      layout={layout || undefined}
      entering={entering}
      exiting={exiting || undefined}
    />
  );
}

/** Springs a view from where it is on screen to its new place, keeping its speed */
function layoutTransition(
  armed: SharedValue<boolean>,
  spring: Spring,
  runs: SharedValue<Runs>,
): LayoutAnimationFunction {
  return (values) => {
    'worklet';
    const size = { width: values.targetWidth, height: values.targetHeight };
    if (!armed.value)
      return {
        initialValues: { originX: values.targetOriginX, originY: values.targetOriginY, ...size },
        animations: {},
      };
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
 * How a removed item leaves: with the change its list animates, it fades out
 * quicker than the glide into its place, so it's mostly gone before another
 * item gets there; otherwise (the list didn't change, or went with it) it
 * goes at once, invisible for the frame Reanimated keeps it.
 */
function leaveAnimation(armed: SharedValue<boolean>): EntryExitAnimationFunction {
  return () => {
    'worklet';
    if (!armed.value)
      return {
        initialValues: { opacity: 0 },
        animations: { opacity: withTiming(0, { duration: 0 }) },
      };
    const timing = { duration: 160, easing: Easing.out(Easing.ease) };
    return {
      initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
      animations: {
        opacity: withTiming(0, timing),
        transform: [{ translateX: withTiming(-12, timing) }],
      },
    };
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
