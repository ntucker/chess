import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { createRoot, type Root } from 'test-renderer';

import { Stage } from './Stage';

// Jest can't load a stylesheet, and the native project doesn't transform Silk's ES modules.
jest.mock('@/theme/narrow.css', () => ({}));
jest.mock('@reactive/silk-native', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useTheme: () => ({ theme: { semantic: { color: { surface: 'black' } }, colorScheme: 'dark' } }),
    Separator: () => null,
    Stack: View,
    Surface: View,
  };
});
jest.mock('@/components/Header', () => ({ Header: () => null }));
// Only the stage's frame is under test, not what the board column holds.
jest.mock('@/components/Board', () => () => null);
jest.mock('@/components/EndingCard', () => ({ EndingCard: () => null }));
jest.mock('@/components/EvaluationBar', () => ({ EvaluationBar: () => null }));
jest.mock('@/components/PlayerBar', () => ({ PlayerBar: () => null }));
jest.mock('@/components/Transport', () => ({ Transport: () => null }));
jest.mock('@/theme/theme', () => ({ spotlight: {} }));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

/** The footer's style on a native page `width` wide, or none without one. */
function footerStyle(width: number) {
  act(() => {
    root ??= createRoot();
    root.render(
      <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width, height: 800 }}>
        <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          <Stage board={null} program={null} footer={<Text>Credits</Text>} />
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>,
    );
  });
  const [text] = root!.container.queryAll((node) => node.props.children === 'Credits');
  return StyleSheet.flatten(text.parent!.props.style);
}

describe('a stage footer', () => {
  it('shows across the foot of a wide page', () => {
    expect(footerStyle(1200)).toMatchObject({ marginTop: 'auto' });
    expect(footerStyle(1200).display).toBeUndefined();
  });

  it('hides on a narrow page, which shows it elsewhere', () => {
    expect(footerStyle(360).display).toBe('none');
  });
});
