import { useReducedMotion } from '@reactive/silk-native';
import {
  Component,
  createContext,
  type ComponentProps,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
} from 'react';
import { View } from 'react-native';
import { MotionHost, useMotionDriver } from './engine';
import { measure, reorder, type Positions } from './reorder';
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
 * (or what decides it) as `layoutDependency`.
 */
export function MotionList(props: Props) {
  return <Measured {...props} still={useReducedMotion()} />;
}

class Measured extends Component<Props & { readonly still: boolean }> {
  private readonly items = new Map<unknown, MotionElement>();

  getSnapshotBeforeUpdate(prev: Props): Positions | null {
    if (!this.changed(prev) || this.props.still) return null;
    return measure(this.items);
  }

  componentDidUpdate(prev: Props, _state: unknown, before: Positions | null) {
    if (before && this.changed(prev))
      reorder(before, this.items, this.props.spring ?? springs.brisk);
  }

  render() {
    return <ListContext value={this.join}>{this.props.children}</ListContext>;
  }

  private changed(prev: Props) {
    return !Object.is(prev.layoutDependency, this.props.layoutDependency);
  }

  /** Joins `el` under `id`; returns the cleanup */
  private readonly join = (id: unknown, el: MotionElement) => {
    this.items.set(id, el);
    return () => {
      if (this.items.get(id) === el) this.items.delete(id);
    };
  };
}

const ListContext = createContext<((id: unknown, el: MotionElement) => () => void) | null>(null);

type ViewProps = Omit<ComponentProps<typeof View>, 'ref'>;

/**
 * A view that moves instead of jumping: inside a `MotionList`, the item
 * named `id` (stable across renders, so it is followed even when React
 * remounts it elsewhere). Use it like a `View`.
 */
export function MotionView({ id, style, ...rest }: ViewProps & { readonly id: unknown }) {
  const join = useContext(ListContext);
  const { attach, props } = useMotionDriver();
  const ref = useCallback(
    (el: MotionElement | null) => {
      if (!el) return;
      const detach = attach(el);
      const leave = join?.(id, el);
      return () => {
        leave?.();
        detach?.();
      };
    },
    [attach, join, id],
  );
  return (
    <MotionHost
      {...rest}
      {...props}
      ref={ref as unknown as Ref<never>}
      style={'style' in props ? [style, props.style] : style}
    />
  );
}
