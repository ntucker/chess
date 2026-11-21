// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { Sheet } from './Sheet';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// Stands in for the navigator: whether the sheet's screen is in front.
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Renders the sheet open, with reduced motion: React Native Web's Modal
 * takes Escape once its entrance animation ends, which jsdom never runs.
 */
let cleanup = () => {};
afterEach(() => cleanup());

function renderSheet(onClose: () => void) {
  const matchMedia = window.matchMedia;
  window.matchMedia = ((media: string) => ({
    ...matchMedia(media),
    matches: media.includes('prefers-reduced-motion: reduce'),
  })) as typeof window.matchMedia;
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <Sheet title="Settings" onClose={onClose}>
          {null}
        </Sheet>
      </SilkProvider>,
    ),
  );
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
    window.matchMedia = matchMedia;
    cleanup = () => {};
  };
}

describe('Sheet', () => {
  it('closes on Escape', () => {
    mockFocused = true;
    const onClose = jest.fn();
    renderSheet(onClose);
    act(() => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent('keyup', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a press beside it, not on one inside it', () => {
    mockFocused = true;
    const onClose = jest.fn();
    renderSheet(onClose);
    const title = document.getElementById(
      document.querySelector('[aria-modal="true"]')!.getAttribute('aria-labelledby')!,
    )!;
    // Silk's Dialog catches presses on the veil in a layer just before its panel.
    const veil = document.querySelector('[data-testid="sheet"]')!.previousElementSibling!;
    const tap = (on: Element) =>
      act(() => {
        on.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        on.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });
    tap(title);
    expect(onClose).not.toHaveBeenCalled();
    tap(veil);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes once another screen comes on top of its own', () => {
    const onClose = jest.fn();
    const root = createRoot(document.createElement('div'));
    const render = () =>
      act(() =>
        root.render(
          <SilkProvider theme={themes.dark}>
            <Sheet title="Settings" onClose={onClose}>
              {null}
            </Sheet>
          </SilkProvider>,
        ),
      );
    mockFocused = true;
    render();
    expect(onClose).not.toHaveBeenCalled();
    mockFocused = false;
    render();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
