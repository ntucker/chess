// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import type { LessonMode } from '@/lesson/guidance';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { LessonControls } from './LessonControls';

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
const moves = () => toggle('Moves on the board');

/** A press through react-native-web's responder system, which listens for mouse events. */
function tap(element: HTMLElement) {
  const mouse = (type: string, buttons: number) =>
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, buttons }));
  mouse('mousedown', 1);
  mouse('mouseup', 0);
  element.click();
}

describe('LessonControls', () => {
  it('disables "Moves on the board" in Practice, keeping its value', async () => {
    await render('practice');
    expect(moves().getAttribute('aria-disabled')).toBe('true');
    expect(moves().getAttribute('aria-checked')).toBe('true');
    await act(async () => moves().click());
    expect(moves().getAttribute('aria-checked')).toBe('true');
    expect(toggle('Warn me of traps').getAttribute('aria-disabled')).not.toBe('true');
  });

  it('says why "Moves on the board" is disabled, to screen readers too', async () => {
    await render('practice');
    const described = moves().getAttribute('aria-describedby');
    expect(described && document.getElementById(described)?.textContent).toBe('Only in Explore');
    await render('explore');
    expect(moves().getAttribute('aria-describedby')).toBeNull();
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

  it('lets "Moves on the board" change in Explore', async () => {
    await render('explore');
    expect(moves().getAttribute('aria-disabled')).not.toBe('true');
    await act(async () => moves().click());
    expect(moves().getAttribute('aria-checked')).toBe('false');
  });
});
