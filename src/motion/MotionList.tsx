/**
 * Android's motion engine (the native one: the app has no iOS build):
 * Reanimated layout animations, which start in the same frame React Native
 * mounts the new layout. Animating from JavaScript after a commit can't:
 * Reanimated holds its updates back while React commits, so the new layout
 * shows for a frame before the animation's start.
 * Each item springs from where it is on screen to its new place on the UI
 * thread, with the web's spring and with the speed it had (Reanimated's own
 * springs drop velocity that points away from the target, so a reversal
 * would stall instead of turning around).
 *
 * A removed item goes at once: Reanimated keeps a view with an `exiting`
 * animation on screen for a frame or two even when that animation does
 * nothing, which drew old rows over new ones.
 */
import { useReducedMotion } from '@reactive/silk-native';
import { Component, createContext, useContext, useMemo, useState } from 'react';
import Animated, {
  type EntryExitAnimationFunction,
  type LayoutAnimationFunction,
  type SharedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { springs, type Spring } from './spring';
import { type Runs, springTo } from './springTo';
import type { MotionListProps, MotionViewProps } from './types';

export function MotionList(props: MotionListProps) {
  return <Arrivals {...props} still={useReducedMotion()} />;
}

interface ArrivalsProps extends MotionListProps {
  readonly still: boolean;
}

/**
 * Whether this render carries the list's `layoutDependency` change, so items
 * mounting in it fade in; null outside a list or while motion is reduced.
 */
type Arriving = boolean | null;

interface State {
  readonly dependency: unknown;
  readonly arriving: Arriving;
}

/** Works out, render by render, whether this render carries the change to animate */
class Arrivals extends Component<ArrivalsProps, State> {
  state: State = { dependency: this.props.layoutDependency, arriving: null };

  static getDerivedStateFromProps(
    { layoutDependency, still }: ArrivalsProps,
    state: State,
  ): State | null {
    const next: Arriving = still ? null : !Object.is(state.dependency, layoutDependency);
    if (next === state.arriving && Object.is(state.dependency, layoutDependency)) return null;
    return { dependency: layoutDependency, arriving: next };
  }

  render() {
    return <ListContext value={this.state.arriving}>{this.props.children}</ListContext>;
  }
}

const ListContext = createContext<Arriving>(null);

const SPRING = springs.brisk;
/** An arrival's fade stops once what's left of it can't be seen: under a pixel's precision, it jumped the last quarter. */
const OPACITY_STEP = 0.01;

export function MotionView({ id: _id, ...rest }: MotionViewProps) {
  const arriving = useContext(ListContext);
  const moving = arriving !== null;
  const runs = useSharedValue<Runs>({});
  const layout = useMemo(
    () => (moving ? layoutTransition(SPRING, runs) : undefined),
    [moving, runs],
  );
  // Read once, at mount: only an arrival fades in.
  const [entering] = useState(() => (arriving ? enterAnimation(SPRING) : undefined));
  // Always an Animated.View, so turning reduced motion on or off keeps each item mounted.
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
        originX: springTo(values.targetOriginX, spring, { runs, axis: 'x' }),
        originY: springTo(values.targetOriginY, spring, { runs, axis: 'y' }),
      },
    };
  };
}

/** Fades an item in that arrived with the change */
function enterAnimation(spring: Spring): EntryExitAnimationFunction {
  return () => {
    'worklet';
    return {
      initialValues: { opacity: 0 },
      animations: { opacity: springTo(1, spring, { precision: OPACITY_STEP }) },
    };
  };
}
