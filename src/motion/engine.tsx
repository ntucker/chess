/**
 * Android's motion engine: Reanimated shared values that a worklet moves
 * every frame on the UI thread, following the same spring as the web's
 * keyframes. Positions come from React Native's DOM-like node API
 * (`offsetLeft`, `offsetTop`, `offsetParent`), which reads layout without
 * transforms, plus the offsets this engine itself is animating, which it
 * knows exactly. Reanimated's own withSpring isn't used: it drops velocity
 * that points away from the target, so a reversal would stall instead of
 * turning around with its momentum.
 */
import { useCallback, useMemo } from 'react';
import Animated, {
  cancelAnimation,
  defineAnimation,
  type AnimationObject,
  type EntryExitAnimationFunction,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import type { ViewStyle } from 'react-native';

import {
  atRest,
  sampleSpring,
  SAMPLE_RATE,
  springAt,
  type Spring,
  type SpringState,
} from './spring';
import { type HostProps, ORIGIN, type MotionElement, type Point, type Position } from './types';

/** Sub-pixel: settles once the remaining motion is invisible */
const PRECISION = 0.25;

/** React Native's element, with the layout reads this needs */
interface NativeElement extends MotionElement {
  readonly offsetLeft: number;
  readonly offsetTop: number;
  readonly offsetWidth: number;
  readonly offsetHeight: number;
  readonly offsetParent: NativeElement | null;
  readonly parentElement: NativeElement | null;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

interface Run {
  readonly spring: Spring;
  readonly start: readonly [x: SpringState, y: SpringState];
  /** ms (performance.now) the glide started, and how long until it rests */
  readonly startedAt: number;
  readonly length: number;
  readonly finished: Promise<void>;
  readonly end: () => void;
}
interface Driver {
  readonly x: SharedValue<number>;
  readonly y: SharedValue<number>;
  /** Opacity is 1 + fade, so a fade springs from -1 to 0 */
  readonly fade: SharedValue<number>;
  /** Whether its `exiting` animation plays when React removes it */
  readonly leaving: SharedValue<boolean>;
  run?: Run;
}
const drivers = new WeakMap<MotionElement, Driver>();

/**
 * The view a `MotionView` renders: an Animated.View owning the shared values
 * the engine moves it with. Reanimated keeps a removed view on screen for its
 * `exiting` animation, which React can't, so that is how an item leaves; it
 * plays only when its list expects the item to leave.
 */
export function MotionHost({ join, arriving, style, ...rest }: HostProps) {
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const fade = useSharedValue(arriving ? -1 : 0);
  const leaving = useSharedValue(false);
  const animated = useAnimatedStyle((): ViewStyle => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    opacity: Math.min(1, 1 + fade.value),
  }));
  const exiting = useMemo(() => leaveAnimation(leaving), [leaving]);
  // The driver outlives the ref: the list fades out an item after React removed it.
  const ref = useCallback(
    (el: MotionElement | null) => {
      if (el) drivers.set(el, { x, y, fade, leaving });
      return join(el);
    },
    [join, x, y, fade, leaving],
  );
  return <Animated.View {...rest} ref={ref as never} style={[style, animated]} exiting={exiting} />;
}

/** Where `el` is on screen now, a glide in flight (its own or a moving parent's) included */
export function measureOf(el: MotionElement): Omit<Position, 'el' | 'parent'> {
  const node = el as NativeElement;
  let x = 0;
  let y = 0;
  for (let up: NativeElement | null = node; up; up = up.offsetParent) {
    x += up.offsetLeft;
    y += up.offsetTop;
  }
  // Offsets are within scroll content: take off how far each scroll view is
  // scrolled (a list that shrinks can clamp it), and add the glides in flight.
  for (let up = node.parentElement as NativeElement | null; up; up = up.parentElement) {
    x -= up.scrollLeft;
    y -= up.scrollTop;
  }
  for (let up: MotionElement | null = el; up; up = up.parentElement) {
    const offset = offsetOf(up);
    x += offset.x;
    y += offset.y;
  }
  return {
    at: { x, y },
    velocity: velocityOf(el),
    width: node.offsetWidth,
    height: node.offsetHeight,
  };
}

/**
 * Springs `el` from `from` to where layout puts it, keeping `velocity`
 * (px/s). Resolves once it lands or another glide replaces it.
 */
export function glide(el: MotionElement, spring: Spring, from: Point, velocity: Point = ORIGIN) {
  stop(el);
  const driver = drivers.get(el);
  if (!driver) return;
  if (!from.x && !from.y && !velocity.x && !velocity.y) return;
  const start = [
    { offset: from.x, velocity: velocity.x },
    { offset: from.y, velocity: velocity.y },
  ] as const;
  const length =
    (Math.max(...start.map((axis) => sampleSpring(spring, axis, PRECISION).length)) - 1) /
    SAMPLE_RATE;
  let end = () => {};
  const finished = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, length * 1000);
    end = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  driver.run = { spring, start, startedAt: performance.now(), length, finished, end };
  driver.x.value = springFrom(spring, start[0]);
  driver.y.value = springFrom(spring, start[1]);
  return finished;
}

/** How fast `el`'s glide is moving it right now (px/s) */
export function velocityOf(el: MotionElement): Point {
  return stateOf(el, ({ velocity }) => velocity);
}

function offsetOf(el: MotionElement): Point {
  return stateOf(el, ({ offset }) => offset);
}

function stateOf(el: MotionElement, read: (state: SpringState) => number): Point {
  const run = drivers.get(el)?.run;
  if (!run) return ORIGIN;
  const t = (performance.now() - run.startedAt) / 1000;
  if (t >= run.length) return ORIGIN;
  const [x, y] = run.start.map((axis) => springAt(run.spring, axis, t));
  return { x: read(x), y: read(y) };
}

/** Ends `el`'s glide, snapping it back to its layout position */
export function stop(el: MotionElement) {
  const driver = drivers.get(el);
  if (!driver) return;
  cancelAnimation(driver.x);
  cancelAnimation(driver.y);
  driver.x.value = 0;
  driver.y.value = 0;
  driver.run?.end();
  driver.run = undefined;
}

/**
 * Not yet on Android: an animated zIndex would send every frame of the view
 * through React Native's commit, giving up the synchronous transform and
 * opacity updates that start a glide in the same frame as its layout.
 */
export function lift(_el: MotionElement, _lifted: boolean) {}

/** Fades a new item in */
export function arrive(el: MotionElement, spring: Spring) {
  const driver = drivers.get(el);
  if (driver) driver.fade.value = springFrom(spring, { offset: -1, velocity: 0 });
}

/** Shows a new item at once */
export function appear(el: MotionElement) {
  const driver = drivers.get(el);
  if (driver) driver.fade.value = 0;
}

/**
 * Arms (or disarms) `el`'s `exiting` animation. Armed before React commits,
 * since the UI thread decides on it when the commit removes the view.
 */
export function expectLeave(el: MotionElement, leaving: boolean) {
  const driver = drivers.get(el);
  if (driver) driver.leaving.value = leaving;
}

/** Nothing to do: the view's armed `exiting` animation fades it out */
export function leave(_position: Position) {}

/** A shared value's animation from `start` to rest at 0, on the UI thread */
function springFrom(spring: Spring, start: SpringState): number {
  'worklet';
  return defineAnimation<AnimationObject<number>>(0, () => {
    'worklet';
    return {
      onStart(animation: AnimationObject<number>, _value: number, now: number) {
        animation.startTime = now;
        animation.current = start.offset;
      },
      onFrame(animation: AnimationObject<number>, now: number) {
        const state = springAt(spring, start, (now - animation.startTime) / 1000);
        const done = atRest(state, PRECISION);
        animation.current = done ? 0 : state.offset;
        return done;
      },
      current: start.offset,
      toValue: 0,
      startTime: 0,
    };
  }) as unknown as number;
}

/**
 * How a removed item leaves: armed, it fades out quicker than the glide into
 * its place, so it's mostly gone before another item gets there; unarmed (its
 * whole list went, or the list didn't change), it goes at once.
 */
function leaveAnimation(leaving: SharedValue<boolean>): EntryExitAnimationFunction {
  return () => {
    'worklet';
    if (!leaving.value) return { initialValues: {}, animations: {} };
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
