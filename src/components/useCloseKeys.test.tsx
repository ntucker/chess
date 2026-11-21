import { afterEach, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { BackHandler } from 'react-native';
import { createRoot, type Root } from 'test-renderer';

import { useCloseKeys } from './useCloseKeys';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  mockFocused = true;
});

/** Renders a panel that closes with `useCloseKeys`; returns what Android's back does. */
function panel(onClose: () => void) {
  const handlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
    handlers.push(handler);
    return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
  });
  function Panel() {
    useCloseKeys(onClose);
    return null;
  }
  act(() => {
    root = createRoot();
    root.render(<Panel />);
  });
  return {
    back: () => handlers.map((handler) => handler({} as never)),
    rerender: () => root!.render(<Panel />),
  };
}

it("closes on Android's back, which then stays on the screen", () => {
  const onClose = jest.fn();
  const { back } = panel(onClose);
  expect(back()).toEqual([true]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('leaves back alone while another screen is in front', () => {
  const onClose = jest.fn();
  const { back, rerender } = panel(onClose);
  mockFocused = false;
  act(rerender);
  expect(back()).toEqual([]);
  expect(onClose).not.toHaveBeenCalled();
});
