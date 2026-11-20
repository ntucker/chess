/** Space between a popup and what it opens from. */
export const POPUP_GAP = 6;
/** The least space a popup keeps from the window's edges. */
export const POPUP_MARGIN = 8;

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A box on screen, from the window's top left corner. */
export interface Box extends Size {
  readonly x: number;
  readonly y: number;
}

/** Where a popup goes, from the window's top left corner, and how tall it may grow there. */
export interface PopupPlace {
  readonly left: number;
  readonly top: number;
  readonly maxHeight: number;
}

/**
 * Where a popup of `size` goes beside `anchor` in a window of `window`'s size:
 * just below it when it fits there or there's more room there than above,
 * otherwise just above it; lined up with its left edge, but kept inside the
 * window. Pure, so both platforms' popups share it.
 */
export function placePopup(anchor: Box, size: Size, window: Size): PopupPlace {
  const bottom = anchor.y + anchor.height;
  const below = window.height - bottom - POPUP_GAP - POPUP_MARGIN;
  const above = anchor.y - POPUP_GAP - POPUP_MARGIN;
  const left = Math.max(POPUP_MARGIN, Math.min(anchor.x, window.width - size.width - POPUP_MARGIN));
  if (size.height <= below || below >= above) {
    return { left, top: bottom + POPUP_GAP, maxHeight: below };
  }
  return { left, top: anchor.y - POPUP_GAP - Math.min(size.height, above), maxHeight: above };
}
