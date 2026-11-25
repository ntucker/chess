// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { captures } from '@/game/material';
import { replay } from '@/game/replay';
import { themes } from '@/theme/theme';

import { PlayerBar } from './PlayerBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const show = (props: Partial<ComponentProps<typeof PlayerBar>>) =>
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <PlayerBar
          name="Maia 1500"
          detail="Black"
          color="black"
          toMove
          captures={captures(replay([]), 0)}
          {...props}
        />
      </SilkProvider>,
    ),
  );

describe('PlayerBar', () => {
  it("turns the disc's ring while the player's engine thinks", () => {
    show({ thinking: true });
    expect(host.querySelector('[role=status]')?.getAttribute('aria-label')).toBe(
      'Maia 1500 is thinking',
    );
    show({ thinking: false });
    expect(host.querySelector('[role=status]')).toBeNull();
  });

  it("fills the disc's ring as its engine downloads, in place of the turning one", () => {
    show({ thinking: true, download: { label: 'Full Stockfish', percent: 42 } });
    const ring = host.querySelector('[role=progressbar]');
    expect(ring?.getAttribute('aria-label')).toBe('Full Stockfish downloading');
    expect(ring?.getAttribute('aria-valuenow')).toBe('42');
    expect(host.querySelector('[role=status]')).toBeNull();
    // Screen readers hear the tip; a mouse or a tap shows it.
    expect(host.textContent).toContain('Full Stockfish: 42% downloaded');
  });
});
