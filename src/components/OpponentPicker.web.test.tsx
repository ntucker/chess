// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { DataProvider } from '@data-client/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  type DownloadFailure,
  type ReportDownload,
  useReportFullStockfishDownload,
} from '@/resources/download';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { OpponentPicker } from './OpponentPicker';

// Its font loads through Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement;
/** Reports full Stockfish's download as its host does. */
let reportDownload: ReportDownload;
function GrabReport() {
  const report = useReportFullStockfishDownload();
  useEffect(() => {
    reportDownload = report;
  }, [report]);
  return null;
}

beforeEach(async () => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <DataProvider>
        <SilkProvider theme={themes.dark}>
          <SettingsProvider>
            <GrabReport />
            <OpponentPicker />
          </SettingsProvider>
        </SilkProvider>
      </DataProvider>,
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

  // Enter and Space reach the trigger, a <button>, as the browser's click,
  // which jsdom doesn't make from a key: the click tests below cover them.
  it('opens from the keyboard on the current step, and the arrows move', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual([
      '1100, Beginner',
      '1500, Club',
      '1900, Advanced',
      'Stockfish, Best move',
      'Full Stockfish, Full strength',
    ]);
    expect(focusedLabel()).toBe('1500, Club');
    expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
    // Taken, so the board's arrow keys (useStepKeys) leave it.
    expect(press('ArrowDown')).toBe(true);
    expect(focusedLabel()).toBe('1900, Advanced');
    press('End');
    expect(focusedLabel()).toBe('Full Stockfish, Full strength');
    press('Home');
    expect(focusedLabel()).toBe('1100, Beginner');
  });

  it('closes when the page scrolls, not when a list elsewhere does', () => {
    act(() => trigger().click());
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    try {
      act(() => {
        elsewhere.dispatchEvent(new Event('scroll'));
      });
      expect(list()).not.toBeNull();
      act(() => {
        document.dispatchEvent(new Event('scroll'));
      });
      expect(list()).toBeNull();
    } finally {
      elsewhere.remove();
    }
  });

  it('picks with Space, closes, and hands focus back', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    press('ArrowUp');
    press(' ');
    expect(list()).toBeNull();
    expect(trigger().textContent).toBe('1100');
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on Escape, handing focus back', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    press('Escape');
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  // jsdom has no PointerEvent, so React Native Web hovers by mouse events.
  // (Crossing from the rating into the list was checked in Chromium.)
  const point = (type: 'mouseenter' | 'mouseleave') =>
    act(() => {
      trigger().dispatchEvent(new MouseEvent(type));
    });
  /** A pointer moving over a row of the list (rows light on a move, not an enter). */
  const pointAt = (row: HTMLElement, pointerType = 'mouse') =>
    act(() => {
      // jsdom has no PointerEvent: a mouse event that carries the pointer's type.
      const event = new MouseEvent('pointermove', { bubbles: true });
      row.dispatchEvent(Object.assign(event, { pointerType }));
    });

  it('opens while pointed at, and closes a moment after the pointer leaves', () => {
    jest.useFakeTimers();
    try {
      point('mouseenter');
      expect(list()).not.toBeNull();
      // Focus stays where it was: pointing isn't the keyboard.
      expect(document.activeElement).toBe(document.body);
      point('mouseleave');
      expect(list()).not.toBeNull();
      act(() => jest.advanceTimersByTime(250));
      expect(list()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('takes the keys from the row pointed at, after the keyboard opened it', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    expect(focusedLabel()).toBe('1500, Club');
    // A row scrolling under a still mouse (an enter, no move) leaves focus be.
    act(() => {
      options()[2].dispatchEvent(new MouseEvent('mouseenter'));
    });
    expect(focusedLabel()).toBe('1500, Club');
    // Pointing at a row lights it, and the keys carry on from there.
    pointAt(options()[2]);
    expect(focusedLabel()).toBe('1900, Advanced');
    press('ArrowUp');
    expect(focusedLabel()).toBe('1500, Club');
    pointAt(options()[0]);
    press(' ');
    expect(trigger().textContent).toBe('1100');
  });

  it('leaves the light where it is as a finger slides over a row', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    pointAt(options()[2], 'touch');
    expect(focusedLabel()).toBe('1500, Club');
    press(' ');
    expect(trigger().textContent).toBe('1500');
  });

  it('leaves focus alone when pointing at a row of a list opened by pointing', () => {
    point('mouseenter');
    pointAt(options()[2]);
    expect(document.activeElement).toBe(document.body);
  });

  it('stays open after a press, when the pointer leaves', () => {
    jest.useFakeTimers();
    try {
      point('mouseenter');
      act(() => trigger().click());
      point('mouseleave');
      act(() => jest.advanceTimersByTime(250));
      expect(list()).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows a saved step outside the presets as chosen, in its place', () => {
    const newValue = JSON.stringify({ opponent: 1300 });
    localStorage.setItem('settings', newValue);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'settings', newValue }));
    });
    act(() => trigger().focus());
    press('ArrowDown');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual([
      '1100, Beginner',
      '1300',
      '1500, Club',
      '1900, Advanced',
      'Stockfish, Best move',
      'Full Stockfish, Full strength',
    ]);
    expect(focusedLabel()).toBe('1300');
    press('ArrowDown');
    expect(focusedLabel()).toBe('1500, Club');
  });

  it('leaves an Escape another control took', () => {
    act(() => trigger().click());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(list()).not.toBeNull();
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
    act(() => options()[3].click());
    expect(trigger().textContent).toBe('Stockfish');
    expect(list()).toBeNull();
  });

  it("shows full Stockfish's download beside it while it runs", async () => {
    act(() => trigger().click());
    act(() => options()[4].click());
    expect(trigger().textContent).toBe('Full Stockfish');
    const progress = () => trigger().nextElementSibling?.textContent;
    // Nothing yet: the host hasn't started, or found the files in the cache.
    expect(progress()).toBeUndefined();
    const report = (percent: number, failure?: DownloadFailure) =>
      act(async () => {
        reportDownload(percent, failure);
      });
    await report(42);
    expect(progress()).toBe('· 42% downloaded');
    await report(0, 'retrying');
    expect(progress()).toBe('· retrying download');
    await report(0, 'newVersion');
    expect(progress()).toBe('· site updated');
    const reload = trigger().nextElementSibling?.nextElementSibling;
    expect(reload?.getAttribute('role')).toBe('button');
    expect(reload?.textContent).toBe('Reload');
    await report(100);
    expect(progress()).toBeUndefined();
  });
});
