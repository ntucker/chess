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
