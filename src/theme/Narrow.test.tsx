import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, useEffect, useLayoutEffect } from 'react';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createRoot, type Root } from 'test-renderer';

import { NARROW_PX, narrowLength, narrowStyles } from '@/theme/narrow';
import { NarrowScroll, useNarrowPart, useNarrowStyles, useNarrowViewport } from '@/theme/Narrow';

// Jest can't load a stylesheet.
jest.mock('@/theme/narrow.css', () => ({}));

const STYLES = narrowStyles((px) => ({
  bar: { height: px(narrowLength('names-bar-height', 60)) },
}));

let seen: { height: unknown; part: unknown; viewport: unknown } | undefined;
let mounts = 0;

function Probe() {
  const { bar } = useNarrowStyles(STYLES);
  const part = useNarrowPart();
  const viewport = useNarrowViewport();
  useLayoutEffect(() => {
    seen = { height: bar.height, part: part('panes').style, viewport: viewport?.height };
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

const resize = (width: number) =>
  act(() => {
    Dimensions.set({ window: { width, height: 800, scale: 1, fontScale: 1 } });
  });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  seen = undefined;
  mounts = 0;
});

const render = () =>
  act(() => {
    root = createRoot();
    root.render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 360, height: 640 },
          insets: { top: 24, bottom: 16, left: 0, right: 0 },
        }}
      >
        <Probe />
        <NarrowScroll part="program">
          <Held />
        </NarrowScroll>
      </SafeAreaProvider>,
    );
  });

describe('a native page', () => {
  it('is narrow below the width the board and the panel need side by side', async () => {
    await resize(360);
    await render();
    expect(seen?.height).toBe(NARROW_PX['names-bar-height']);
    expect(seen?.part).toContainEqual(expect.objectContaining({ flexDirection: 'row' }));
  });

  it('turns wide when the window widens, keeping what a scrolling part holds', async () => {
    await resize(360);
    await render();
    await resize(800);
    expect(seen?.height).toBe(60);
    expect(seen?.part).toBeUndefined();
    await resize(360);
    expect(seen?.height).toBe(NARROW_PX['names-bar-height']);
    expect(mounts).toBe(1);
  });

  it("measures the app's frame less its system bars", async () => {
    await resize(360);
    await render();
    expect(seen?.viewport).toBe(640 - 24 - 16);
  });
});
