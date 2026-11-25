import { afterEach, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { BackHandler } from 'react-native';
import { createRoot, type Root } from 'test-renderer';

import { usePages } from './usePages';

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

let root: Root | undefined;
afterEach(() => {
  jest.restoreAllMocks();
  act(() => root?.unmount());
  root = undefined;
  mockFocused = true;
});

type Page = 'lesson' | 'scoresheet';

/** Renders pages from `usePages`; returns what shows, a way to pick, and what Android's back does. */
function pages() {
  const handlers: Parameters<typeof BackHandler.addEventListener>[1][] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
    handlers.push(handler);
    return { remove: () => handlers.splice(handlers.indexOf(handler), 1) };
  });
  let current: ReturnType<typeof usePages<Page>> | undefined;
  function Pages({ shown }: { readonly shown: boolean }) {
    current = usePages<Page>('lesson', shown);
    return null;
  }
  const render = (shown: boolean) => act(() => root!.render(<Pages shown={shown} />));
  root = createRoot();
  render(true);
  return {
    page: () => current!.page,
    show: (page: Page) => act(() => current!.show(page)),
    render,
    back: () => {
      let handled: (boolean | null | undefined)[] = [];
      act(() => {
        handled = handlers.map((handler) => handler({} as never));
      });
      return handled;
    },
  };
}

it("returns home on Android's back, which then stays on the screen", () => {
  const { page, show, back } = pages();
  expect(back()).toEqual([]);
  show('scoresheet');
  expect(page()).toBe('scoresheet');
  expect(back()).toEqual([true]);
  expect(page()).toBe('lesson');
  expect(back()).toEqual([]);
});

it('leaves back to the screen pushed over it, as /openings is over a lesson', () => {
  const { page, show, render, back } = pages();
  show('scoresheet');
  mockFocused = false;
  render(true);
  expect(back()).toEqual([]);
  expect(page()).toBe('scoresheet');
});

it('reads as home while the pages are not shown, leaving back to the screen', () => {
  const { page, show, render, back } = pages();
  show('scoresheet');
  render(false);
  expect(page()).toBe('lesson');
  expect(back()).toEqual([]);
  // The page picked comes back with the pages.
  render(true);
  expect(page()).toBe('scoresheet');
});
