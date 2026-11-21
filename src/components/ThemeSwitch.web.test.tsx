// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { ThemeSwitch } from './ThemeSwitch';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <ThemeSwitch />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const button = () => host.querySelector<HTMLElement>('[role="button"]')!;
const saved = () => JSON.parse(localStorage.getItem('settings')!).theme;
const radio = (label: string) =>
  host.querySelector<HTMLElement>(`[role="radio"][aria-label="${label}"]`)!;
const choicesOpen = () => radio('Light').parentElement!.getAttribute('aria-hidden') !== 'true';
/** A pointer of `pointerType` coming onto the button, or leaving it for the page. */
const pointer = (type: 'pointerover' | 'pointerout', pointerType: string) =>
  act(() => {
    // jsdom has no PointerEvent: a mouse event that carries the pointer's type.
    const event = new MouseEvent(type, {
      bubbles: true,
      relatedTarget: type === 'pointerout' ? document.body : null,
    });
    button().dispatchEvent(Object.assign(event, { pointerType }));
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

  it.each(['mouse', 'pen'])('opens the choices while a %s rests on it', (pointerType) => {
    expect(choicesOpen()).toBe(false);
    pointer('pointerover', pointerType);
    expect(choicesOpen()).toBe(true);
    pointer('pointerout', pointerType);
    expect(choicesOpen()).toBe(false);
  });

  it("leaves a finger's choices to holding it", () => {
    pointer('pointerover', 'touch');
    expect(choicesOpen()).toBe(false);
  });
});
