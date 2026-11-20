// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { OpponentPicker } from './OpponentPicker';

// Its font loads through Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement;

beforeEach(async () => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <OpponentPicker />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
});

const trigger = () => host.querySelector<HTMLElement>('[aria-expanded]')!;
const list = () => document.querySelector('[role="listbox"]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const focusedLabel = () => document.activeElement?.getAttribute('aria-label');

/** Presses `key` on whatever has focus; returns whether something took it (prevented its default). */
function press(key: string) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe('OpponentPicker', () => {
  it('shows the current step, closed', () => {
    expect(trigger().textContent).toBe('1500');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(list()).toBeNull();
  });

  it('opens from the keyboard on the current step, and the arrows move', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual([
      '1100, Beginner',
      '1200',
      '1300',
      '1400',
      '1500, Club',
      '1600',
      '1700',
      '1800',
      '1900, Advanced',
      'Stockfish, Best move',
    ]);
    expect(focusedLabel()).toBe('1500, Club');
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
    // The board's arrow keys (useStepKeys) skip a key the list took.
    expect(press('ArrowDown')).toBe(true);
    expect(focusedLabel()).toBe('1600');
    press('End');
    expect(focusedLabel()).toBe('Stockfish, Best move');
    press('Home');
    expect(focusedLabel()).toBe('1100, Beginner');
  });

  it('picks with Space, closes, and hands focus back', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    press('ArrowUp');
    press(' ');
    expect(list()).toBeNull();
    expect(trigger().textContent).toBe('1400');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Escape, handing focus back', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    press('Escape');
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('opens on a press, and a press elsewhere closes it', () => {
    act(() => trigger().click());
    expect(list()).not.toBeNull();
    act(() => {
      // jsdom has no PointerEvent; the listener reads only its target.
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(list()).toBeNull();
  });

  it('picks a step pressed in the list', () => {
    act(() => trigger().click());
    act(() => options()[9].click());
    expect(trigger().textContent).toBe('Stockfish');
    expect(list()).toBeNull();
  });
});
