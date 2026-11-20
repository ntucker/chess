// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { ScoresheetDrawer } from './ScoresheetDrawer';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// Stands in for the navigator: whether the drawer's screen is in front.
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderDrawer(ply: number, total: number) {
  const onClose = jest.fn();
  const onGoto = jest.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <ScoresheetDrawer ply={ply} total={total} onGoto={onGoto} onClose={onClose}>
          {null}
        </ScoresheetDrawer>
      </SilkProvider>,
    ),
  );
  /** The drawer's button that reads or is labelled `name`. */
  const button = (name: string) =>
    [...host.querySelectorAll<HTMLElement>('[role=button]')].find(
      (found) => found.textContent === name || found.getAttribute('aria-label') === name,
    )!;
  return { button, onClose, onGoto, unmount: () => act(() => root.unmount()) };
}

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('ScoresheetDrawer', () => {
  beforeEach(() => {
    mockFocused = true;
  });

  it('closes on Escape while its screen is in front', () => {
    const { onClose, unmount } = renderDrawer(1, 2);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('leaves Escape alone while another screen is on top', () => {
    mockFocused = false;
    const { onClose, unmount } = renderDrawer(1, 2);
    escape();
    expect(onClose).not.toHaveBeenCalled();
    unmount();
  });

  it('closes from its close button', () => {
    const { button, onClose, unmount } = renderDrawer(1, 2);
    act(() => button('Close the scoresheet').click());
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('jumps to either end, except the one the board is at', () => {
    const { button, onGoto, unmount } = renderDrawer(0, 2);
    expect(button('Start').getAttribute('aria-disabled')).toBe('true');
    act(() => button('Latest').click());
    expect(onGoto).toHaveBeenCalledWith(2);
    unmount();
  });
});
