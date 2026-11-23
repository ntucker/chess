import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';
import { act, type ReactNode, useState } from 'react';
import { SafeAreaFrameContext, SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { createRoot, type Root } from 'test-renderer';

import { Transport } from './Transport';

// The native project doesn't transform Silk's ES modules, or load stylesheets and fonts.
jest.mock('@/theme/narrow.css', () => ({}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@reactive/silk-native', () => {
  const { View: MockView } = jest.requireActual<typeof import('react-native')>('react-native');
  const color = { tones: { neutral: {} } };
  return {
    Pressable: ({ style, ...props }: { style?: unknown; children?: ReactNode }) => (
      <MockView {...props} />
    ),
    useTheme: () => ({ theme: { semantic: { color } } }),
  };
});

/** Lets `ms` pass, a repeat at a time, so each step's render sets the next. */
function wait(ms: number) {
  for (let passed = 0; passed < ms; passed += 40) act(() => jest.advanceTimersByTime(40));
}

let root: Root | undefined;
beforeEach(() => {
  jest.useFakeTimers();
});
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  jest.useRealTimers();
});

/** Renders `children` on a narrow phone screen. */
function render(children: ReactNode) {
  act(() => {
    root = createRoot();
    root.render(
      <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width: 360, height: 800 }}>
        <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
          {children}
        </SafeAreaInsetsContext.Provider>
      </SafeAreaFrameContext.Provider>,
    );
  });
}

/** A stepper over a game of `total` moves, at `start`; returns where it is now. */
function stepper(start: number, total: number) {
  let at = start;
  function Game() {
    const [ply, setPly] = useState(start);
    at = ply;
    return <Transport ply={ply} total={total} onGoto={setPly} />;
  }
  render(<Game />);
  const arrow = (label: string) =>
    root!.container.queryAll((node) => node.props.accessibilityLabel === label)[0].props;
  return { arrow, ply: () => at };
}

it('keeps stepping while a step arrow is held, until let go', () => {
  const { arrow, ply } = stepper(0, 10);
  act(() => arrow('Forward').onLongPress());
  expect(ply()).toBe(1);
  wait(360);
  expect(ply()).toBe(4);
  act(() => arrow('Forward').onPressOut());
  wait(1000);
  expect(ply()).toBe(4);
});

it('stops at the end of the game it holds toward, after which a tap steps once', () => {
  const { arrow, ply } = stepper(3, 5);
  act(() => arrow('Back').onLongPress());
  wait(2000);
  expect(ply()).toBe(0);
  act(() => arrow('Forward').onPress());
  wait(2000);
  expect(ply()).toBe(1);
});

it('steps once per tap, each way, and turns an arrow off at its end', () => {
  const { arrow, ply } = stepper(1, 2);
  act(() => arrow('Back').onPress());
  expect(ply()).toBe(0);
  expect(arrow('Back').disabled).toBe(true);
  act(() => arrow('Forward').onPress());
  act(() => arrow('Forward').onPress());
  expect(ply()).toBe(2);
  expect(arrow('Forward').disabled).toBe(true);
});

it('grows its middle only when asked to fill its row, never in a name bar', () => {
  const middleGrow = (fill: boolean) => {
    render(
      <Transport
        ply={0}
        total={2}
        onGoto={() => {}}
        fill={fill}
        middle={<View testID="middle" />}
      />,
    );
    const [middle] = root!.container.queryAll((node) => node.props.testID === 'middle');
    const grow = StyleSheet.flatten(middle.parent!.props.style)?.flexGrow;
    act(() => root!.unmount());
    root = undefined;
    return grow;
  };
  expect(middleGrow(true)).toBe(1);
  expect(middleGrow(false)).toBeUndefined();
});
