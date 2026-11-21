// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Dimensions } from 'react-native';

import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { ThemeSwitch } from './ThemeSwitch';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

/** The switch, in a window `width` wide. */
const render = (width = 1024) => {
  jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 768, scale: 1, fontScale: 1 });
  root.render(
    <SilkProvider theme={themes.dark}>
      <SettingsProvider>
        <ThemeSwitch />
      </SettingsProvider>
    </SilkProvider>,
  );
};

beforeEach(async () => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => render());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  jest.restoreAllMocks();
});

const button = () => host.querySelector<HTMLElement>('[role="button"]')!;
const saved = () => JSON.parse(localStorage.getItem('settings')!).theme;
const radio = (label: string) =>
  host.querySelector<HTMLElement>(`[role="radio"][aria-label="${label}"]`)!;
/** Whether the choices are open: their pill, around the row of radios, is shown. */
const choicesOpen = () =>
  radio('Light').parentElement!.parentElement!.getAttribute('aria-hidden') !== 'true';
/** A pointer of `pointerType` coming onto the button, or leaving it for the page; the choices open once measured. */
const pointer = (type: 'pointerover' | 'pointerout', pointerType: string) =>
  act(async () => {
    // jsdom has no PointerEvent: a mouse event that carries the pointer's type.
    const event = new MouseEvent(type, {
      bubbles: true,
      relatedTarget: type === 'pointerout' ? document.body : null,
    });
    button().dispatchEvent(Object.assign(event, { pointerType }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('ThemeSwitch', () => {
  it('shows the theme in use, and a tap steps to the next', async () => {
    expect(button().getAttribute('aria-label')).toBe("Theme: Device's theme");
    await act(async () => button().click());
    expect(button().getAttribute('aria-label')).toBe('Theme: Light');
    expect(saved()).toBe('light');
    await act(async () => button().click());
    await act(async () => button().click());
    expect(saved()).toBe('system');
  });

  it('names each choice for screen readers, and marks the one in use', async () => {
    expect(radio("Device's theme").getAttribute('aria-checked')).toBe('true');
    await act(async () => radio('Dark').click());
    expect(saved()).toBe('dark');
    expect(radio('Dark').getAttribute('aria-checked')).toBe('true');
  });

  it.each(['mouse', 'pen'])('opens the choices while a %s rests on it', async (pointerType) => {
    expect(choicesOpen()).toBe(false);
    await pointer('pointerover', pointerType);
    expect(choicesOpen()).toBe(true);
    await pointer('pointerout', pointerType);
    expect(choicesOpen()).toBe(false);
  });

  it('stays shut for a mouse that leaves before the choices are measured', async () => {
    act(() => {
      const over = new MouseEvent('pointerover', { bubbles: true, relatedTarget: null });
      const out = new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body });
      button().dispatchEvent(Object.assign(over, { pointerType: 'mouse' }));
      button().dispatchEvent(Object.assign(out, { pointerType: 'mouse' }));
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(choicesOpen()).toBe(false);
  });

  it("leaves a finger's choices to holding it", async () => {
    await pointer('pointerover', 'touch');
    expect(choicesOpen()).toBe(false);
  });

  describe('held by a finger', () => {
    /** A touch event on `target` at `pageX` and `pageY`, as React Native Web reads one. */
    /** A finger, 1 unless said, at `pageX` and `pageY`. */
    const finger = (pageX: number, pageY = 15, identifier = 1) => ({
      identifier,
      pageX,
      pageY,
      clientX: pageX,
      clientY: pageY,
      target: button(),
    });
    /** A touch event for finger 1 at `pageX` and `pageY`, with `others` down too, as React Native Web reads one. */
    const touch = (type: string, pageX: number, pageY = 15, others: object[] = []) =>
      act(() => {
        const point = finger(pageX, pageY);
        const ended = type === 'touchend' || type === 'touchcancel';
        const down = ended ? others : [...others, point];
        const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
          touches: down,
          changedTouches: [point],
          targetTouches: down,
        });
        button().dispatchEvent(event);
      });
    /** Holds a finger on the button's middle long enough to open the choices. */
    const hold = () => {
      touch('touchstart', 115);
      act(() => jest.advanceTimersByTime(600));
    };

    beforeEach(() => {
      jest.useFakeTimers();
      // The button 30 wide at x 100. Opened from the device's theme, the
      // choices span 100 to 190: Device's theme, Light, Dark.
      jest
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockReturnValue({ x: 100, y: 0, left: 100, top: 0, width: 30, height: 30 } as DOMRect);
    });
    afterEach(() => {
      jest.useRealTimers();
    });

    it('opens the choices, and a swipe then a lift chooses by how far it went', () => {
      hold();
      expect(choicesOpen()).toBe(true);
      touch('touchmove', 145);
      touch('touchend', 145);
      expect(saved()).toBe('light');
      expect(choicesOpen()).toBe(false);
    });

    it('keeps the theme when the finger lifts where it was held, even after wobbling', () => {
      hold();
      touch('touchmove', 104);
      touch('touchmove', 128);
      touch('touchend', 120);
      expect(localStorage.getItem('settings')).toBeNull();
      expect(choicesOpen()).toBe(false);
    });

    it('takes the end choice for a swipe past either end', () => {
      hold();
      touch('touchmove', 600);
      touch('touchend', 600);
      expect(saved()).toBe('dark');
      hold();
      touch('touchmove', -50);
      touch('touchend', -50);
      expect(saved()).toBe('system');
    });

    it('keeps the theme when the finger leaves up or down to close', () => {
      hold();
      touch('touchmove', 175, 100);
      touch('touchend', 175, 100);
      expect(localStorage.getItem('settings')).toBeNull();
      expect(choicesOpen()).toBe(false);
    });

    it("keeps the theme when held and lifted at the window's edge", () => {
      // 160 wide: the choices move 35 left to stay 4 inside, off the button's middle.
      act(() => render(160));
      hold();
      expect(choicesOpen()).toBe(true);
      touch('touchend', 115);
      expect(localStorage.getItem('settings')).toBeNull();
    });

    it('chooses where the finger lifts, before its swipe has drawn', () => {
      hold();
      act(() => {
        // One act: the move's render hasn't happened when the finger lifts.
        touch('touchmove', 145);
        touch('touchend', 145);
      });
      expect(saved()).toBe('light');
    });

    it('reads the held finger, not another one down on the screen', () => {
      const resting = finger(300, 400, 2);
      touch('touchstart', 115, 15, [resting]);
      act(() => jest.advanceTimersByTime(600));
      touch('touchmove', 175, 15, [resting]);
      touch('touchend', 175, 15, [resting]);
      expect(saved()).toBe('dark');
    });

    it('closes without choosing when the touch is cancelled', () => {
      hold();
      touch('touchmove', 145);
      touch('touchcancel', 145);
      expect(localStorage.getItem('settings')).toBeNull();
      expect(choicesOpen()).toBe(false);
    });
  });
});
