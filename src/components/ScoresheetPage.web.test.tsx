// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { replay } from '@/game/replay';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { ScoresheetOpener, ScoresheetPage } from './ScoresheetPage';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Two moves: 1.e4 c6. */
const plies = replay(['e2e4', 'c7c6']);

function renderPage(ply: number) {
  const onGoto = jest.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <ScoresheetPage plies={plies} marks={[]} ply={ply} onGoto={onGoto} />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
  /** The page's button that reads or is labelled `name`. */
  const button = (name: string) =>
    [...host.querySelectorAll<HTMLElement>('[role=button]')].find(
      (found) => found.textContent === name || found.getAttribute('aria-label') === name,
    )!;
  return { button, onGoto, unmount: () => act(() => root.unmount()) };
}

describe('ScoresheetPage', () => {
  it('jumps to either end, except the one the board is at', () => {
    const { button, onGoto, unmount } = renderPage(0);
    expect(button('Start').getAttribute('aria-disabled')).toBe('true');
    act(() => button('Latest').click());
    expect(onGoto).toHaveBeenCalledWith(2);
    unmount();
  });

  it('lists the moves it is given, each a step to its ply', () => {
    const { button, onGoto, unmount } = renderPage(2);
    act(() => button('e4').click());
    expect(onGoto).toHaveBeenCalledWith(1);
    act(() => button('c6').click());
    expect(onGoto).toHaveBeenLastCalledWith(2);
    unmount();
  });
});

describe('ScoresheetOpener', () => {
  /** The opener's label, and whether it is disabled and expanded. */
  function opener(props: Parameters<typeof ScoresheetOpener>[0]) {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <SilkProvider theme={themes.dark}>
          <SettingsProvider>
            <ScoresheetOpener {...props} />
          </SettingsProvider>
        </SilkProvider>,
      ),
    );
    const button = host.querySelector('[role=button]')!;
    const found = {
      label: button.getAttribute('aria-label'),
      disabled: button.getAttribute('aria-disabled') === 'true',
      expanded: button.getAttribute('aria-expanded'),
    };
    act(() => root.unmount());
    return found;
  }

  it('names the move on the board and says whether the scoresheet shows', () => {
    expect(opener({ san: 'e4', ply: 1, disabled: false, open: true, onToggle: () => {} })).toEqual({
      label: 'Scoresheet, 1.e4',
      disabled: false,
      expanded: 'true',
    });
  });

  it('has nothing to open before the first move', () => {
    expect(opener({ ply: 0, disabled: true, open: false, onToggle: () => {} })).toEqual({
      label: 'Scoresheet, Start',
      disabled: true,
      expanded: 'false',
    });
  });
});
