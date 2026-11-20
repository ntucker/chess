import { describe, expect, it } from '@jest/globals';

import { placePopup, POPUP_GAP, POPUP_MARGIN } from './popupPlace';

const window = { width: 400, height: 800 };
const popup = { width: 200, height: 300 };

describe('placePopup', () => {
  it('goes below its anchor, lined up with its left edge, when it fits there', () => {
    const anchor = { x: 50, y: 100, width: 40, height: 16 };
    expect(placePopup(anchor, popup, window)).toEqual({
      left: 50,
      top: 116 + POPUP_GAP,
      maxHeight: 800 - 116 - POPUP_GAP - POPUP_MARGIN,
    });
  });

  it('goes above when it fits only there', () => {
    const anchor = { x: 50, y: 600, width: 40, height: 16 };
    expect(placePopup(anchor, popup, window)).toEqual({
      left: 50,
      top: 600 - POPUP_GAP - 300,
      maxHeight: 600 - POPUP_GAP - POPUP_MARGIN,
    });
  });

  it('takes the roomier side, shrunk to it, when it fits neither', () => {
    const tall = { width: 200, height: 900 };
    const high = { x: 50, y: 300, width: 40, height: 16 };
    expect(placePopup(high, tall, window).top).toBe(316 + POPUP_GAP);
    const low = { x: 50, y: 500, width: 40, height: 16 };
    expect(placePopup(low, tall, window)).toEqual({
      left: 50,
      top: POPUP_MARGIN,
      maxHeight: 500 - POPUP_GAP - POPUP_MARGIN,
    });
  });

  it('stays inside the window', () => {
    const right = { x: 350, y: 100, width: 40, height: 16 };
    expect(placePopup(right, popup, window).left).toBe(400 - 200 - POPUP_MARGIN);
    const left = { x: -20, y: 100, width: 40, height: 16 };
    expect(placePopup(left, popup, window).left).toBe(POPUP_MARGIN);
  });
});
