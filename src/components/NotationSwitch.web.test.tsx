// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SilkProvider, Text } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SettingsProvider } from '@/settings/SettingsProvider';
import { fonts, themes } from '@/theme/theme';

import { Notation } from './Notation';
import { NotationSwitch } from './NotationSwitch';

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
          <NotationSwitch />
          <Text testID="move">
            <Notation>{'Found with 9.Ne1, on try 2.'}</Notation>
          </Text>
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const toggle = () => host.querySelector<HTMLElement>('[role="switch"]')!;
const move = () => host.querySelector<HTMLElement>('[data-testid="move"]')!;
/** The parts of the move's text drawn in the piece font. */
const pieces = () =>
  [...move().querySelectorAll<HTMLElement>('span, div')]
    .filter((part) => getComputedStyle(part).fontFamily === fonts.figurines)
    .map((part) => part.textContent);

describe('NotationSwitch', () => {
  it('draws pieces as icons until switched to letters, keeping the text', async () => {
    expect(toggle().getAttribute('aria-label')).toBe('Piece icons in moves');
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(pieces()).toEqual(['N']);
    expect(move().textContent).toBe('Found with 9.Ne1, on try 2.');

    await act(async () => toggle().click());
    expect(toggle().getAttribute('aria-checked')).toBe('false');
    expect(pieces()).toEqual([]);
    expect(move().textContent).toBe('Found with 9.Ne1, on try 2.');
    expect(JSON.parse(localStorage.getItem('settings')!).notation).toBe('letters');

    await act(async () => toggle().click());
    expect(pieces()).toEqual(['N']);
  });
});
