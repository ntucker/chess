/**
 * Android's motion engine: Reanimated layout animations, which start in the
 * same frame React Native mounts the new layout. Animating from JavaScript
 * after a commit can't: Reanimated holds its updates back while React
 * commits, so the new layout shows for a frame before the animation's start.
 * Each item springs from where it is on screen to its new place on the UI
 * thread, with the web's spring and with the speed it had (Reanimated's own
 * springs drop velocity that points away from the target, so a reversal
 * would stall instead of turning around).
 *
 * Unlike the web, an item glides whenever its place changes, not only with
 * `layoutDependency`: that names the change whose new items fade in. A
 * removed item goes at once: Reanimated keeps a view with an `exiting`
 * animation on screen for a frame or two even when that animation does
 * nothing, which drew old rows over new ones.
 */
import { useReducedMotion } from '@reactive/silk-native';
import { Component, createContext, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  type AnimationObject,
  defineAnimation,
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
  type SharedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { atRest, springAt, springs, SUBPIXEL, type Spring, type SpringState } from './spring';
import type { MotionListProps, MotionViewProps } from './types';

export function MotionList(props: MotionListProps) {
  return <Arrivals {...props} still={useReducedMotion()} />;
}

interface ArrivalsProps extends MotionListProps {
  readonly still: boolean;
}

interface ListContextValue {
  readonly spring: Spring;
  /** This render carries the change the list animates: items mounting in it fade in */
  readonly arriving: boolean;
}

interface State {
  readonly dependency: unknown;
  /** Null while motion is reduced */
  readonly list: ListContextValue | null;
}

/** Works out, render by render, whether this render carries the change to animate */
class Arrivals extends Component<ArrivalsProps, State> {
  state: State = { dependency: this.props.layoutDependency, list: null };

  static getDerivedStateFromProps(
    { layoutDependency, spring = springs.brisk, still }: ArrivalsProps,
    { dependency, list }: State,
  ): State | null {
    const arriving = !Object.is(dependency, layoutDependency);
    if (still) return list || arriving ? { dependency: layoutDependency, list: null } : null;
    if (!arriving && list?.spring === spring && !list.arriving) return null;
    return { dependency: layoutDependency, list: { spring, arriving } };
  }

  render() {
    return <ListContext value={this.state.list}>{this.props.children}</ListContext>;
  }
}

const ListContext = createContext<ListContextValue | null>(null);

/** Where a view's spring on one axis started, to read its speed if interrupted */
interface Run {
  readonly start: SpringState;
  readonly startedAt: number;
}
type Runs = { x?: Run; y?: Run };

export function MotionView({ id: _id, ...rest }: MotionViewProps) {
  const list = useContext(ListContext);
  const spring = list?.spring;
  const runs = useSharedValue<Runs>({});
  const layout = useMemo(() => spring && layoutTransition(spring, runs), [spring, runs]);
  // Read once, at mount: only an arrival fades in.
  const [entering] = useState(() => (list?.arriving ? enterAnimation(list.spring) : undefined));
  if (!layout) return <View {...rest} />;
  return <Animated.View {...rest} layout={layout} entering={entering} />;
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
        const done = atRest(state, SUBPIXEL);
        animation.current = target + (done ? 0 : state.offset);
        return done;
      },
      current: target,
      toValue: target,
    };
  }) as unknown as number;
}
