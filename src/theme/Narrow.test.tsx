import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, useEffect, useLayoutEffect } from 'react';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createRoot, type Root } from 'test-renderer';

import { NARROW_PX, narrowLength, narrowStyles } from '@/theme/narrow';
import {
  NarrowScroll,
  useNarrowPageHeight,
  useNarrowPart,
  useNarrowStyles,
  useNarrowViewport,
} from '@/theme/Narrow';
import { NARROW_PAGE_MIN } from '@/theme/sideBySide';

// Jest can't load a stylesheet.
jest.mock('@/theme/narrow.css', () => ({}));

const STYLES = narrowStyles((px) => ({
  bar: { height: px(narrowLength('names-bar-height', 60)) },
}));

let seen: { height: unknown; part: unknown; viewport: unknown; page: unknown } | undefined;
let mounts = 0;

function Probe() {
  const { bar } = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const viewport = useNarrowViewport();
  const page = useNarrowPageHeight();
  useLayoutEffect(() => {
    seen = { height: bar.height, part: part('panes').style, viewport: viewport?.height, page };
  });
  return null;
}

/** Counts its mounts, so a remount shows. */
function Held() {
  useEffect(() => {
    mounts += 1;
  }, []);
  return null;
}

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  seen = undefined;
  mounts = 0;
});

const INSETS = { top: 24, bottom: 16, left: 0, right: 0 };

/** The app as a frame of `width` by `height`, with its system bars. */
const tree = (width: number, height = 800, insets = INSETS) => (
  <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width, height }}>
    <SafeAreaInsetsContext.Provider value={insets}>
      <Probe />
      <NarrowScroll part="program">
        <Held />
      </NarrowScroll>
    </SafeAreaInsetsContext.Provider>
  </SafeAreaFrameContext.Provider>
);

const render = (...args: Parameters<typeof tree>) =>
  act(() => {
    root ??= createRoot();
    root.render(tree(...args));
  });

describe('a native page', () => {
  it('is narrow below the width the board and the panel need side by side', async () => {
    await render(360);
    expect(seen?.height).toBe(NARROW_PX['names-bar-height']);
    expect(seen?.part).toContainEqual(expect.objectContaining({ flexDirection: 'row' }));
  });

  it('turns wide when the window widens, keeping what a scrolling part holds', async () => {
    await render(360);
    await render(800);
    expect(seen?.height).toBe(60);
    expect(seen?.part).toBeUndefined();
    await render(360);
    expect(seen?.height).toBe(NARROW_PX['names-bar-height']);
    expect(mounts).toBe(1);
  });

  it("measures the app's frame less its system bars", async () => {
    await render(360, 640);
    expect(seen?.viewport).toBe(640 - 24 - 16);
  });

  it('gives a narrow page a definite height, the window or its floor, and a wide one none', async () => {
    await render(360, 1000);
    expect(seen?.page).toBe(1000 - 24 - 16);
    await render(360, 500);
    expect(seen?.page).toBe(NARROW_PAGE_MIN);
    await render(800);
    expect(seen?.page).toBeUndefined();
  });

  it('is narrow where a cutout leaves too little room beside it', async () => {
    await render(720, 360, { top: 0, bottom: 0, left: 48, right: 0 });
    expect(seen?.height).toBe(NARROW_PX['names-bar-height']);
  });
});
