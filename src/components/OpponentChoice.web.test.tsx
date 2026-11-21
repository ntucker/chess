// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { OpponentChoice } from './OpponentChoice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const show = (choice: ReactNode) =>
  act(async () =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>{choice}</SettingsProvider>
      </SilkProvider>,
    ),
  );

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

const option = (name: string) =>
  [...host.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (radio) => radio.getAttribute('aria-label') === name,
  )!;
const checked = () =>
  host.querySelector('[role="radio"][aria-checked="true"]')?.getAttribute('aria-label');

/** A press through react-native-web's responder system, which listens for mouse events. */
function click(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, buttons: 1 }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    element.click();
  });
}

describe('OpponentChoice', () => {
  it('chooses the opponent', async () => {
    await show(<OpponentChoice />);
    expect(checked()).toBe('1500');
    click(option('1900'));
    expect(checked()).toBe('1900');
  });

  it('shows disabled with the reason as its tooltip, and chooses nothing', async () => {
    await show(<OpponentChoice disabledReason="Auto play is off" />);
    expect(option('1900').getAttribute('aria-disabled')).toBe('true');
    click(option('1900'));
    expect(checked()).toBe('1500');
    // The options take no focus, so the whole does, and says why.
    const whole = host.querySelector<HTMLElement>('[tabindex="0"]')!;
    expect(document.getElementById(whole.getAttribute('aria-describedby')!)!.textContent).toBe(
      'Auto play is off',
    );
    // As the keyboard focuses it: the browser matches :focus-visible (jsdom never does).
    const matches = whole.matches.bind(whole);
    whole.matches = ((selector: string) =>
      selector === ':focus-visible' || matches(selector)) as typeof whole.matches;
    act(() => whole.focus());
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe('Auto play is off');
  });
});
