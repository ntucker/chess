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
