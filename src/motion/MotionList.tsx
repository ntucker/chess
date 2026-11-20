import { useReducedMotion } from '@reactive/silk-native';
import { Component, createContext, type ReactNode, useCallback, useContext, useRef } from 'react';
import type { ViewProps } from 'react-native';

import { MotionHost, useListMotion } from './engine';
import { springs, type Spring } from './spring';
import type { Key, ListMotion, MotionElement } from './types';

interface Props {
  /** Items only move when this changes (the list they're rendered from) */
  readonly layoutDependency: unknown;
  readonly spring?: Spring;
  readonly children: ReactNode;
}

/**
 * Glides its items (`MotionView`s with an `id`) to wherever a change moves
 * them, fading in the ones that arrive and out the ones that leave, on the
 * web and on Android alike. It renders no element of its own and knows
 * nothing of the layout, so it fits any list.
 *
 * It measures before React changes the screen, so it must re-render with
 * the change it animates: put it where the list is read, and pass the list
 * (or what decides it) as `layoutDependency`. Changes that leave it alone
 * land at once.
 */
export function MotionList(props: Props) {
  const motion = useListMotion(props.spring ?? springs.brisk);
  return <Measured {...props} motion={motion} still={useReducedMotion()} />;
}

interface MeasuredProps extends Props {
  readonly motion: ListMotion;
  readonly still: boolean;
}

interface State {
  readonly dependency: unknown;
  /** This render animates a change: items mounting in it arrive */
  readonly list: ListContextValue;
}

class Measured extends Component<MeasuredProps, State> {
  private readonly items = new Map<Key, MotionElement>();

  /** Joins `el` under `id`; returns the cleanup */
  private readonly join = (id: Key, el: MotionElement) => {
    this.items.set(id, el);
    return () => {
      if (this.items.get(id) === el) this.items.delete(id);
    };
  };

  state: State = {
    dependency: this.props.layoutDependency,
    list: { join: this.join, motion: this.props.motion, arriving: false },
  };

  static getDerivedStateFromProps(
    { layoutDependency, motion, still }: MeasuredProps,
    { dependency, list }: State,
  ): Partial<State> | null {
    const arriving = !still && !Object.is(dependency, layoutDependency);
    if (
      arriving === list.arriving &&
      motion === list.motion &&
      Object.is(dependency, layoutDependency)
    )
      return null;
    return { dependency: layoutDependency, list: { join: list.join, motion, arriving } };
  }

  getSnapshotBeforeUpdate(prev: Props): { readonly before: unknown } | null {
    if (!this.changed(prev) || this.props.still) return null;
    return { before: this.props.motion.before(this.items) };
  }

  componentDidUpdate(prev: Props, _state: unknown, snapshot: { readonly before: unknown } | null) {
    if (snapshot && this.changed(prev)) this.props.motion.after(snapshot.before, this.items);
  }

  render() {
    return <ListContext value={this.state.list}>{this.props.children}</ListContext>;
  }

  private changed(prev: Props) {
    return !Object.is(prev.layoutDependency, this.props.layoutDependency);
  }
}

interface ListContextValue {
  readonly join: (id: Key, el: MotionElement) => () => void;
  readonly motion: ListMotion;
  readonly arriving: boolean;
}
const ListContext = createContext<ListContextValue | null>(null);

/**
 * A view that moves instead of jumping: inside a `MotionList`, the item
 * named `id` (stable across renders, so it is followed even when React
 * remounts it elsewhere). Use it like a `View`; the motion owns its
 * transform and opacity.
 */
export function MotionView({ id, ...rest }: Omit<ViewProps, 'id'> & { readonly id: Key }) {
  const list = useContext(ListContext);
  const join = list?.join;
  // React Native Web's View calls a ref with null rather than running the
  // cleanup it returned, so the cleanup is kept here and run either way.
  const joined = useRef<() => void>(undefined);
  const ref = useCallback(
    (el: MotionElement | null) => {
      joined.current?.();
      joined.current = undefined;
      if (!el || !join) return;
      const cleanup = join(id, el);
      joined.current = cleanup;
      return () => {
        if (joined.current !== cleanup) return;
        joined.current = undefined;
        cleanup();
      };
    },
    [join, id],
  );
  return (
    <MotionHost {...rest} join={ref} list={list?.motion ?? null} arriving={!!list?.arriving} />
  );
}
