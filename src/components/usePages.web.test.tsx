// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { OpponentPicker } from '@/components/OpponentPicker';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { usePages } from './usePages';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
// Stands in for the navigator: whether the pages' screen is in front.
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Page = 'lesson' | 'scoresheet';

let unmount: (() => void) | undefined;
beforeEach(() => {
  mockFocused = true;
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
});

/**
 * Renders pages from `usePages`, beside the opponent slider when `withSlider`,
 * showing the scoresheet; returns which page shows.
 */
function scoresheetShown({ withSlider = false } = {}) {
  let current: ReturnType<typeof usePages<Page>> | undefined;
  function Pages() {
    current = usePages<Page>('lesson', true);
    return null;
  }
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          {withSlider ? <OpponentPicker /> : null}
          <Pages />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
  act(() => current!.show('scoresheet'));
  unmount = () => {
    act(() => root.unmount());
    host.remove();
  };
  return { page: () => current!.page, host };
}

/** Presses Escape on the page; `taken` when another control (an open popup list) took it first. */
const escape = (taken = false) =>
  act(() => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    if (taken) event.preventDefault();
    window.dispatchEvent(event);
  });

describe('usePages on the web', () => {
  it('returns home on Escape while its screen is in front', () => {
    const { page } = scoresheetShown();
    escape();
    expect(page()).toBe('lesson');
  });

  it('leaves an Escape another control took, so one Escape closes one thing', () => {
    const { page } = scoresheetShown();
    escape(true);
    expect(page()).toBe('scoresheet');
  });

  it('leaves Escape alone while another screen is on top', () => {
    mockFocused = false;
    const { page } = scoresheetShown();
    escape();
    expect(page()).toBe('scoresheet');
  });

  it('stays on its page as one Escape closes the opponent slider over it', () => {
    const { page, host } = scoresheetShown({ withSlider: true });
    const slider = () => document.querySelector('[role="slider"]');
    // By pointing, which moves no focus: the keyboard's focus would open the slider's tooltip,
    // and that takes an Escape of its own.
    act(() => {
      host
        .querySelector<HTMLElement>('[aria-expanded]')!
        .dispatchEvent(new MouseEvent('mouseenter'));
    });
    expect(slider()).not.toBeNull();
    const press = () =>
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      });
    press();
    expect(slider()).toBeNull();
    expect(page()).toBe('scoresheet');
    press();
    expect(page()).toBe('lesson');
  });
});
