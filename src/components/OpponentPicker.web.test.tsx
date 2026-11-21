// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { DataProvider } from '@data-client/react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, type ReactNode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import {
  type DownloadFailure,
  type ReportDownload,
  useReportFullStockfishDownload,
} from '@/resources/download';
import { describeOpponent } from '@/opponent/opponent';
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

/** Draws `picker` in the page, in place of the one before. */
const show = (picker: ReactNode) =>
  act(async () =>
    root!.render(
      <DataProvider>
        <SilkProvider theme={themes.dark}>
          <SettingsProvider>
            <GrabReport />
            {picker}
          </SettingsProvider>
        </SilkProvider>
      </DataProvider>,
    ),
  );

beforeEach(async () => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await show(<OpponentPicker />);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
});

const trigger = () => host.querySelector<HTMLElement>('[aria-expanded]')!;
const popover = () => document.querySelector<HTMLElement>('[role="dialog"]');
const thumb = () => document.querySelector<HTMLElement>('[role="slider"]');
/** The stop under the thumb, as a screen reader says it. */
const stop = () => thumb()?.getAttribute('aria-valuetext');
/** Stockfish's ratings are estimates that may be measured again: read them, don't repeat them. */
const about = (opponent: 'stockfish' | 'stockfish-full') =>
  `about ${describeOpponent(opponent).rating}`;

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
    expect(popover()).toBeNull();
  });

  // Enter and Space reach the trigger, a <button>, as the browser's click,
  // which jsdom doesn't make from a key: the click tests below cover them.
  it('opens from the keyboard with the thumb focused on the current step, and the arrows choose', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(thumb());
    expect(thumb()!.getAttribute('aria-label')).toBe('Opponent strength');
    expect(stop()).toBe('1500, Club');
    // Taken, so the board's arrow keys (useStepKeys) leave it.
    expect(press('ArrowRight')).toBe(true);
    expect(stop()).toBe('1900, Advanced');
    // Chosen at once, and still open to try the next.
    expect(trigger().textContent).toBe('1900');
    expect(document.activeElement).toBe(thumb());
    press('ArrowRight');
    expect(stop()).toBe(`Stockfish, ${about('stockfish')}, Best move`);
    press('End');
    expect(stop()).toBe(`Full Stockfish, ${about('stockfish-full')}, Full strength`);
    expect(trigger().textContent).toBe('Full Stockfish');
    press('Home');
    expect(stop()).toBe('1100, Beginner');
    expect(trigger().textContent).toBe('1100');
  });

  it('names the stop under the thumb and its rating', () => {
    act(() => trigger().click());
    expect(popover()!.textContent).toContain('Club1500');
    press('End');
    expect(popover()!.textContent).toContain(
      `Full strength≈${describeOpponent('stockfish-full').rating}`,
    );
  });

  // jsdom has no PointerEvent, so React Native Web hovers by mouse events.
  // (Crossing from the rating into the list was checked in Chromium.)
  const point = (type: 'mouseenter' | 'mouseleave') =>
    act(() => {
      trigger().dispatchEvent(new MouseEvent(type));
    });
  const tooltip = () => document.querySelector('[role="tooltip"]');
  /** What a screen reader reads after the thumb's name and value. */
  const description = () =>
    document.getElementById(thumb()!.getAttribute('aria-describedby')!)!.textContent;

  it('keeps how the stop plays in a tooltip, which the keyboard opens with the slider', () => {
    // Opened by pointing, it explains nothing yet (a resting mouse was checked in Chromium).
    point('mouseenter');
    expect(tooltip()).toBeNull();
    expect(description()).toBe('Maia plays the way people rated about 1500 do.');
    press('Escape');
    act(() => trigger().focus());
    press('ArrowDown');
    expect(tooltip()!.textContent).toBe('Maia plays the way people rated about 1500 do.');
    // It follows the thumb, and says where a rating is an estimate.
    press('End');
    const said = `${describeOpponent('stockfish-full').style} Its rating is an estimate.`;
    expect(tooltip()!.textContent).toBe(said);
    expect(description()).toBe(said);
    // One Escape closes the tooltip, the next the popover.
    press('Escape');
    expect(tooltip()).toBeNull();
    expect(popover()).not.toBeNull();
    press('Escape');
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes when scrolling moves the rating, not when a list elsewhere scrolls', () => {
    act(() => trigger().click());
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    try {
      act(() => {
        elsewhere.dispatchEvent(new Event('scroll'));
      });
      expect(popover()).not.toBeNull();
      // The page scrolled the rating up (jsdom lays nothing out, so say where it went).
      trigger().getBoundingClientRect = () => new DOMRect(0, -40, 60, 20);
      act(() => {
        document.dispatchEvent(new Event('scroll'));
      });
      expect(popover()).toBeNull();
    } finally {
      elsewhere.remove();
    }
  });

  it('closes on Escape, handing focus back', () => {
    // Opened by pointing, so the keyboard's focus hasn't opened the tooltip, which takes an Escape first.
    point('mouseenter');
    act(() => trigger().focus());
    press('Escape');
    expect(popover()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes on a second Escape from the thumb, after the tooltip, handing focus back', () => {
    act(() => trigger().focus());
    press('ArrowDown');
    press('ArrowLeft');
    press('Escape');
    expect(popover()).not.toBeNull();
    press('Escape');
    expect(popover()).toBeNull();
    expect(trigger().textContent).toBe('1100');
    expect(document.activeElement).toBe(trigger());
  });

  it('opens while pointed at, and closes a moment after the pointer leaves', () => {
    jest.useFakeTimers();
    try {
      point('mouseenter');
      expect(popover()).not.toBeNull();
      // Focus stays where it was: pointing isn't the keyboard.
      expect(document.activeElement).toBe(document.body);
      point('mouseleave');
      expect(popover()).not.toBeNull();
      act(() => jest.advanceTimersByTime(250));
      expect(popover()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('holds a slide that strays off the popover until the pointer lifts', () => {
    jest.useFakeTimers();
    try {
      point('mouseenter');
      // jsdom has no PointerEvent; the listeners read nothing from it.
      act(() => {
        thumb()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
      });
      point('mouseleave');
      act(() => jest.advanceTimersByTime(250));
      expect(popover()).not.toBeNull();
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup'));
      });
      expect(popover()).not.toBeNull();
      act(() => jest.advanceTimersByTime(250));
      expect(popover()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('moves focus onto a slider opened by pointing once the rating is pressed', () => {
    point('mouseenter');
    expect(document.activeElement).toBe(document.body);
    act(() => trigger().click());
    expect(document.activeElement).toBe(thumb());
    expect(stop()).toBe('1500, Club');
  });

  it('stays open after a press, when the pointer leaves', () => {
    jest.useFakeTimers();
    try {
      point('mouseenter');
      act(() => trigger().click());
      point('mouseleave');
      act(() => jest.advanceTimersByTime(250));
      expect(popover()).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives a saved step outside the presets its own stop, in its place', () => {
    const newValue = JSON.stringify({ opponent: 1300 });
    localStorage.setItem('settings', newValue);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'settings', newValue }));
    });
    act(() => trigger().focus());
    press('ArrowDown');
    expect(stop()).toBe('1300');
    expect(thumb()!.getAttribute('aria-valuenow')).toBe('1');
    expect(thumb()!.getAttribute('aria-valuemax')).toBe('5');
    press('ArrowRight');
    expect(stop()).toBe('1500, Club');
    // Its stop stays while the slider is open, to go back to.
    expect(thumb()!.getAttribute('aria-valuemax')).toBe('5');
    press('ArrowLeft');
    expect(stop()).toBe('1300');
    expect(trigger().textContent).toBe('1300');
    press('ArrowRight');
    // Closed (the tooltip first) and opened again, the stop is gone.
    press('Escape');
    press('Escape');
    act(() => trigger().click());
    expect(thumb()!.getAttribute('aria-valuemax')).toBe('4');
  });

  it('leaves an Escape another control took', () => {
    act(() => trigger().click());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(popover()).not.toBeNull();
  });

  it('opens on a press, and a press elsewhere closes it', async () => {
    act(() => trigger().click());
    expect(popover()).not.toBeNull();
    // The list starts listening for presses outside it a moment after it opens.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    act(() => {
      // jsdom has no PointerEvent; the listener reads only its target.
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(popover()).toBeNull();
  });

  it('closes on a second press of the rating, without opening again', async () => {
    act(() => trigger().click());
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    // A press on the rating is left to its own toggle, not taken as one outside the list.
    act(() => {
      trigger().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    });
    expect(popover()).not.toBeNull();
    act(() => trigger().click());
    expect(popover()).toBeNull();
  });

  it("shows full Stockfish's download beside it while it runs", async () => {
    act(() => trigger().click());
    press('End');
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
