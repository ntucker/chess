import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';

import type { Spring } from './spring';

/** A point or offset in px, on screen */
export interface Point {
  readonly x: number;
  readonly y: number;
}
export const ORIGIN: Point = { x: 0, y: 0 };

/**
 * The host element behind a `MotionView`: a DOM element on the web, React
 * Native's element (its DOM-like node API) on Android. The shared code only
 * walks the tree; each engine reads positions and animates in its own way.
 */
export interface MotionElement {
  readonly parentElement: MotionElement | null;
  readonly isConnected: boolean;
  contains(other: MotionElement): boolean;
}

/** Where an item was, kept so a change that takes it away can fade it out there */
export interface Position {
  readonly at: Point;
  readonly velocity: Point;
  readonly el: MotionElement;
  readonly parent: MotionElement | null;
  readonly width: number;
  readonly height: number;
}

/** Elements under keys that stay the same from one render to the next (an item's id) */
export type Key = string | number;
export type Items = ReadonlyMap<Key, MotionElement>;

/**
 * How one `MotionList` animates a change, made once per list by the engine's
 * `useListMotion`: `before` runs as React is about to change the screen and
 * `after` once it has, with what `before` returned.
 */
export interface ListMotion {
  before(items: Items): unknown;
  after(before: unknown, items: Items): void;
}

/** What a `MotionView` renders: a view its engine can move */
export interface HostProps extends ViewProps {
  /** Called with the host element when it mounts and null when it goes; may return a cleanup */
  readonly join: (el: MotionElement | null) => (() => void) | undefined;
  /** The list it is in, if any */
  readonly list: ListMotion | null;
  /** It renders with a change its list animates: mounting now, it fades in; moving, it glides */
  readonly animating: boolean;
}

/**
 * A platform's motion engine (`engine.tsx` for Android, `engine.web.tsx`).
 * TypeScript resolves `./engine` to the Android file alone, so
 * `engine.contract.ts` holds both to this.
 */
export interface Engine {
  readonly MotionHost: ComponentType<HostProps>;
  useListMotion(spring: Spring): ListMotion;
}
