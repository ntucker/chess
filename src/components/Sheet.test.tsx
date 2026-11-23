import { afterEach, expect, it, jest } from '@jest/globals';
import { act, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createRoot, type Root } from 'test-renderer';

import { Sheet } from './Sheet';

// Jest can't load a stylesheet, and the native project doesn't transform Silk's ES modules.
jest.mock('@/theme/narrow.css', () => ({}));
jest.mock('@reactive/silk-native', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  const Pass = ({ children }: { children?: ReactNode }) => children;
  return {
    Inline: Pass,
    Dialog: { Root: Pass, Content: MockView, Title: Pass, ScrollView: MockView },
  };
});
jest.mock('@/components/HeaderButton', () => {
  const { narrowLength } = jest.requireActual<typeof import('@/theme/narrow')>('@/theme/narrow');
  return { HeaderButton: () => null, HEADER_BUTTON_SIZE: narrowLength('header-button-size', 36) };
});
jest.mock('@/theme/theme', () => ({
  themes: { dark: { semantic: { space: [0, 4, 8, 12, 16, 20] } } },
}));
jest.mock('expo-router', () => ({ useIsFocused: () => true }));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

it('keeps its content above the navigation bar the app draws under', () => {
  act(() => {
    root = createRoot();
    root.render(
      <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width: 360, height: 800 }}>
        <SafeAreaInsetsContext.Provider value={{ top: 24, bottom: 48, left: 0, right: 0 }}>
          <Sheet open title="Settings" onClose={() => {}}>
            <View />
          </Sheet>
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>,
    );
  });
  const [sheet] = root!.container.queryAll((node) => node.props.testID === 'sheet');
  expect(StyleSheet.flatten(sheet.props.style).paddingBottom).toBe(48);
});
