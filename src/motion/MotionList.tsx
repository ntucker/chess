import { useReducedMotion } from '@reactive/silk-native';
import { Component, createContext, type ReactNode, useCallback, useContext, useRef } from 'react';
import type { ViewProps } from 'react-native';

import { MotionHost } from './engine';
import { type Key, measure, reorder, type Positions } from './reorder';
import { springs, type Spring } from './spring';
import type { MotionElement } from './types';

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
  return <Measured {...props} still={useReducedMotion()} />;
}

interface State {
  readonly dependency: unknown;
  /** This render animates a change: items mounting in it arrive */
  readonly list: ListContextValue;
}

class Measured extends Component<Props & { readonly still: boolean }, State> {
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
    list: { join: this.join, arriving: false },
  };

  static getDerivedStateFromProps(
    { layoutDependency, still }: Props & { readonly still: boolean },
    { dependency, list }: State,
  ): Partial<State> | null {
    const arriving = !still && !Object.is(dependency, layoutDependency);
    if (arriving === list.arriving && Object.is(dependency, layoutDependency)) return null;
    return { dependency: layoutDependency, list: { join: list.join, arriving } };
  }

  getSnapshotBeforeUpdate(prev: Props): Positions | null {
    if (!this.changed(prev) || this.props.still) return null;
    return measure(this.items);
  }

  componentDidUpdate(prev: Props, _state: unknown, before: Positions | null) {
    if (before && this.changed(prev))
      reorder(before, this.items, this.props.spring ?? springs.brisk);
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
  return <MotionHost {...rest} join={ref} arriving={!!list?.arriving} />;
}
