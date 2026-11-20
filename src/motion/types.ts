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

/** What a `MotionView` renders: a view the engine can move, joined to its list through `join` */
export interface HostProps extends ViewProps {
  /** Called with the host element when it mounts and null when it goes; may return a cleanup */
  readonly join: (el: MotionElement | null) => (() => void) | undefined;
  /** It mounts as an arrival its list will fade in: it starts hidden */
  readonly arriving: boolean;
}

/**
 * A platform's motion engine (`engine.ts` for Android, `engine.web.ts`).
 * TypeScript resolves `./engine` to the Android file alone, so
 * `engine.contract.ts` holds both to this.
 */
export interface Engine {
  readonly MotionHost: ComponentType<HostProps>;
  /** Where `el` is on screen now, glides in flight included, and its size */
  measureOf(el: MotionElement): Omit<Position, 'el' | 'parent'>;
  /** Springs `el` from `from` to its layout position; resolves when it lands or is replaced */
  glide(
    el: MotionElement,
    spring: Spring,
    from: Point,
    velocity?: Point,
  ): Promise<void> | undefined;
  /** Ends `el`'s glide at its layout position */
  stop(el: MotionElement): void;
  /** Raises `el` over its siblings while it crosses them */
  lift(el: MotionElement, lifted: boolean): void;
  /** Fades in an item that arrived */
  arrive(el: MotionElement, spring: Spring): void;
  /** Shows at once an item that arrived (it took the spot of one that left) */
  appear(el: MotionElement): void;
  /** Whether `el` fades out if React removes it in the coming commit */
  expectLeave(el: MotionElement, leaving: boolean): void;
  /** Fades out, where it was, an item React removed */
  leave(position: Position): void;
}
