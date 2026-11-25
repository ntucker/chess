import type { LayoutRectangle } from 'react-native';

/** Where a row sits in the scrolled content. */
export type Frame = Pick<LayoutRectangle, 'y' | 'height'>;

/** The part of the content a scroll view shows: from `top`, `height` tall. */
export interface Viewport {
  top: number;
  height: number;
}

/**
 * Where to scroll so `frame` shows whole: the least distance, or undefined
 * where it already shows, or before the viewport has a height.
 */
export function revealOffset(frame: Frame, { top, height }: Viewport) {
  if (height <= 0) return undefined;
  if (frame.y < top) return frame.y;
  const bottom = frame.y + frame.height;
  if (bottom > top + height) return bottom - height;
  return undefined;
}

/**
 * A scrolled list's viewport, and where a scroll it started is heading. An
 * animated scroll's events report the offsets it passes, not where it will
 * stop, so until they go quiet (`settleMs`) a reveal reckons from where the
 * list is heading.
 */
export function scrollTracker(settleMs = SETTLE_MS) {
  const viewport: Viewport = { top: 0, height: 0 };
  let heading: number | undefined;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const settleSoon = () => {
    clearTimeout(settle);
    settle = setTimeout(() => (heading = undefined), settleMs);
  };
  return {
    /** Where to scroll to show `frame` whole, now where the list is heading; undefined where it will show. */
    reveal(frame: Frame) {
      const y = revealOffset(frame, { height: viewport.height, top: heading ?? viewport.top });
      if (y !== undefined) {
        heading = y;
        settleSoon();
      }
      return y;
    },
    /** The list's scroll event: it is at `top`. */
    scrolled(top: number) {
      viewport.top = top;
      if (heading !== undefined) settleSoon();
    },
    resized(height: number) {
      viewport.height = height;
    },
    dispose() {
      clearTimeout(settle);
    },
  };
}

/** How long a list's scroll events stay quiet once it has stopped. */
const SETTLE_MS = 150;
