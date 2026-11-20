import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createRoot, type Root } from 'test-renderer';

import { Page } from './Page';

// Jest can't load a stylesheet, and the native project doesn't transform Silk's ES modules.
jest.mock('@/theme/narrow.css', () => ({}));
jest.mock('@reactive/silk-native', () => ({
  useTheme: () => ({ theme: { semantic: { color: { surface: 'black' } }, colorScheme: 'dark' } }),
}));
jest.mock('@/components/Header', () => ({ Header: () => null }));
jest.mock('@/theme/theme', () => ({ spotlight: {} }));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

/** The height the page's scrolling content takes on a 360 by 800 phone. */
function contentHeight(fillsWindow: boolean) {
  act(() => {
    root ??= createRoot();
    root.render(
      <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width: 360, height: 800 }}>
        <SafeAreaInsetsContext.Provider value={{ top: 24, bottom: 16, left: 0, right: 0 }}>
          <Page maxWidth={600} fillsWindow={fillsWindow}>
            {null}
          </Page>
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>,
    );
  });
  const [scroll] = root!.container.queryAll((node) => 'contentContainerStyle' in node.props);
  return StyleSheet.flatten(scroll.props.contentContainerStyle).height;
}

describe('a narrow native page', () => {
  it('is the window’s height when a panel inside scrolls on its own', () => {
    expect(contentHeight(true)).toBe(800 - 24 - 16);
  });

  it('grows with its content otherwise, so a long list scrolls', () => {
    expect(contentHeight(false)).toBeUndefined();
  });
});
