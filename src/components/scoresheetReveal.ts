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
 * How long a list's scroll events stay quiet once it has stopped: well above
 * the interval the scoresheet's ScrollView reports them at (`scrollEventThrottle`).
 */
export const SETTLE_MS = 150;

/**
 * A scrolled list's viewport, and where a scroll it started is heading. An
 * animated scroll's events report the offsets it passes, not where it will
 * stop, so a reveal reckons from where the list is heading until it arrives,
 * turns away (the player took the list), or its events go quiet.
 */
export function scrollTracker() {
  const viewport: Viewport = { top: 0, height: 0 };
  let heading: number | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  const forget = () => {
    heading = undefined;
    clearTimeout(quiet);
  };
  const forgetOnceQuiet = () => {
    clearTimeout(quiet);
    quiet = setTimeout(forget, SETTLE_MS);
  };
  return {
    /** Where to scroll to show `frame` whole, now where the list is heading; undefined where it will show. */
    reveal(frame: Frame) {
      const y = revealOffset(frame, { height: viewport.height, top: heading ?? viewport.top });
      if (y !== undefined) {
        heading = y;
        forgetOnceQuiet();
      }
      return y;
    },
    /** The list's scroll event: it is at `top`. */
    scrolled(top: number) {
      const before = viewport.top;
      viewport.top = top;
      if (heading === undefined) return;
      const left = Math.abs(top - heading);
      if (left < 1 || left > Math.abs(before - heading)) forget();
      else forgetOnceQuiet();
    },
    resized(height: number) {
      viewport.height = height;
    },
    dispose: forget,
  };
}
