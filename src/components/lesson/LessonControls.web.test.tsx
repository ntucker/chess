// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { LessonMode } from '@/lesson/guidance';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { LessonControls } from './LessonControls';

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const render = (mode: LessonMode) =>
  act(async () =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <LessonControls mode={mode} onMode={() => {}} />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );

const toggle = (label: string) =>
  host.querySelector<HTMLElement>(`[role="switch"][aria-label="${label}"]`)!;
const moves = () => toggle('Arrows');

/** A press through react-native-web's responder system, which listens for mouse events. */
function tap(element: HTMLElement) {
  const mouse = (type: string, buttons: number) =>
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, buttons }));
  mouse('mousedown', 1);
  mouse('mouseup', 0);
  element.click();
}

describe('LessonControls', () => {
  it('disables "Arrows" in Practice, keeping its value', async () => {
    await render('practice');
    expect(moves().getAttribute('aria-disabled')).toBe('true');
    expect(moves().getAttribute('aria-checked')).toBe('true');
    await act(async () => moves().click());
    expect(moves().getAttribute('aria-checked')).toBe('true');
    expect(toggle('Warn of traps').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('says why "Arrows" is disabled, or else what it does, to screen readers too', async () => {
    const description = () => {
      const described = moves().getAttribute('aria-describedby');
      return described && document.getElementById(described)?.textContent;
    };
    await render('practice');
    expect(description()).toBe('Only in Explore');
    await render('explore');
    expect(description()).toMatch(/^Draws the next moves/);
  });

  it('shows why in a tooltip when the disabled switch is tapped', async () => {
    const tip = () => document.querySelector('[role="tooltip"]')?.textContent;
    await render('explore');
    await act(async () => tap(moves()));
    expect(tip()).toBeUndefined();
    await render('practice');
    await act(async () => tap(moves()));
    expect(tip()).toBe('Only in Explore');
  });

  it("shows a switch's hint when its info icon is tapped", async () => {
    const tip = () => document.querySelector('[role="tooltip"]')?.textContent;
    await render('explore');
    const [, trapsHint] = host.querySelectorAll<HTMLElement>('[data-testid="toggle-hint"]');
    await act(async () => tap(trapsHint!));
    expect(tip()).toMatch(/^Draws a trap's moves/);
  });

  it('toggles a hinted switch from its label, without its tooltip', async () => {
    const tip = () => document.querySelector('[role="tooltip"]');
    await render('explore');
    const traps = toggle('Warn of traps');
    const label = [...host.querySelectorAll<HTMLElement>('[data-field-label]')].find(
      (node) => node.textContent === 'Warn of traps',
    )!;
    await act(async () => tap(label));
    expect(traps.getAttribute('aria-checked')).toBe('true');
    expect(tip()).toBeNull();
  });

  it('lets "Arrows" change in Explore', async () => {
    await render('explore');
    expect(moves().getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => moves().click());
    expect(moves().getAttribute('aria-checked')).toBe('false');
  });
});
