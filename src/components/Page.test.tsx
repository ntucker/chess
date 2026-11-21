import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createRoot, type Root } from 'test-renderer';

import { Page } from './Page';

// Jest can't load a stylesheet, and the native project doesn't transform Silk's ES modules.
jest.mock('@/theme/narrow.css', () => ({}));
jest.mock('@reactive/silk-native', () => ({
  useTheme: () => ({ theme: { semantic: { color: { surface: 'black' } }, colorScheme: 'dark' } }),
  Separator: () => null,
  Stack: jest.requireActual<typeof import('react-native')>('react-native').View,
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

/** The styles of the footer and the page around it, on a native page `width` wide. */
function footerStyles(width: number) {
  act(() => {
    root ??= createRoot();
    root.render(
      <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width, height: 800 }}>
        <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          <Page maxWidth={600} fillsWindow footer={<Text>Credits</Text>}>
            {null}
          </Page>
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>,
    );
  });
  const [text] = root!.container.queryAll((node) => node.props.children === 'Credits');
  const footer = text.parent!;
  return {
    footer: StyleSheet.flatten(footer.props.style),
    page: StyleSheet.flatten(footer.parent!.props.style),
  };
}

describe('a page footer', () => {
  it('sits at the foot of a wide page, which grows to the window', () => {
    const { footer, page } = footerStyles(1200);
    expect(footer).toMatchObject({ marginTop: 'auto', maxWidth: 600 });
    expect(footer.display).toBeUndefined();
    expect(page.flexGrow).toBe(1);
  });

  it('hides on a narrow page, which shows it elsewhere', () => {
    expect(footerStyles(360).footer.display).toBe('none');
  });
});
