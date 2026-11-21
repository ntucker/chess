/**
 * The web's motion engine: a list measures its items before each commit
 * and glides each from where it was (`reorder.ts`), animating the
 * DOM elements React Native Web renders (`dom.ts`). Not React's
 * `<ViewTransition>`: an interrupted view transition skips to its end rather
 * than turning around at the speed it had, and the page can't be used while
 * one runs.
 */
import { useReducedMotion } from '@reactive/silk-native';
import { Component, createContext, useCallback, useContext, useRef } from 'react';
import { View } from 'react-native';

import type { MotionElement } from './dom';
import { measure, type Positions, reorder } from './reorder';
import { springs } from './spring';
import type { Key, MotionListProps, MotionViewProps } from './types';

export function MotionList(props: MotionListProps) {
  return <Measured {...props} still={useReducedMotion()} />;
}

interface MeasuredProps extends MotionListProps {
  readonly still: boolean;
}

class Measured extends Component<MeasuredProps> {
  private readonly items = new Map<Key, MotionElement>();

  /** Joins `el` under `id`; returns the cleanup */
  private readonly join = (id: Key, el: MotionElement) => {
    this.items.set(id, el);
    return () => {
      if (this.items.get(id) === el) this.items.delete(id);
    };
  };

  getSnapshotBeforeUpdate(): Positions | null {
    return this.props.still ? null : measure(this.items);
  }

  componentDidUpdate(prev: MotionListProps, _state: unknown, before: Positions | null) {
    if (!before) return;
    const fades = !Object.is(prev.layoutDependency, this.props.layoutDependency);
    reorder(before, this.items, springs.brisk, { fades });
  }

  render() {
    return <Join value={this.join}>{this.props.children}</Join>;
  }
}

const Join = createContext<((id: Key, el: MotionElement) => () => void) | null>(null);

export function MotionView({ id, ...rest }: MotionViewProps) {
  const join = useContext(Join);
  // No cleanup returned, so React calls this with null when the view goes
  // (React Native Web's View ignores a returned cleanup anyway).
  const joined = useRef<() => void>(undefined);
  // React Native Web hands a ref its DOM element, which React Native's types don't say.
  const ref = useCallback(
    (el: MotionElement | null) => {
      joined.current?.();
      joined.current = el && join ? join(id, el) : undefined;
    },
    [join, id],
  );
  return <View {...rest} ref={ref as never} />;
}
