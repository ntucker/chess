// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
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
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <ScoresheetDrawer ply={ply} total={total} onGoto={() => {}} onClose={onClose}>
          {null}
        </ScoresheetDrawer>
      </SilkProvider>,
    ),
  );
  return { host, onClose, unmount: () => act(() => root.unmount()) };
}

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('ScoresheetDrawer', () => {
  it('closes on Escape while its screen is in front', () => {
    mockFocused = true;
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
    mockFocused = true;
  });

  it('turns off the jump to the end the board is already at', () => {
    const { host, unmount } = renderDrawer(0, 2);
    const disabled = (name: string) =>
      [...host.querySelectorAll('[role=button]')]
        .find((button) => button.textContent === name)
        ?.getAttribute('aria-disabled') === 'true';
    expect([disabled('Start'), disabled('Latest')]).toEqual([true, false]);
    unmount();
  });
});
