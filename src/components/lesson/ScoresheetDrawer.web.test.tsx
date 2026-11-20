// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { replay } from '@/game/replay';
import { themes } from '@/theme/theme';

import { ScoresheetDrawer, ScoresheetOpener, shownMove } from './ScoresheetDrawer';

// Their font and images need Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@/components/QualityBadge', () => ({ QualityBadge: () => null }));
// Stands in for the navigator: whether the drawer's screen is in front.
let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Two moves: 1.e4 c6. */
const plies = replay(['e2e4', 'c7c6']);

function renderDrawer(ply: number) {
  const onClose = jest.fn();
  const onGoto = jest.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <ScoresheetDrawer
          plies={plies}
          qualities={[]}
          ply={ply}
          onGoto={onGoto}
          onClose={onClose}
        />
      </SilkProvider>,
    ),
  );
  /** The drawer's button that reads or is labelled `name`. */
  const button = (name: string) =>
    [...host.querySelectorAll<HTMLElement>('[role=button]')].find(
      (found) => found.textContent === name || found.getAttribute('aria-label') === name,
    )!;
  return { button, onClose, onGoto, unmount: () => act(() => root.unmount()) };
}

const escape = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

describe('ScoresheetDrawer', () => {
  beforeEach(() => {
    mockFocused = true;
  });

  it('closes on Escape while its screen is in front', () => {
    const { onClose, unmount } = renderDrawer(1);
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('leaves Escape alone while another screen is on top', () => {
    mockFocused = false;
    const { onClose, unmount } = renderDrawer(1);
    escape();
    expect(onClose).not.toHaveBeenCalled();
    unmount();
  });

  it('closes from its close button', () => {
    const { button, onClose, unmount } = renderDrawer(1);
    act(() => button('Close the scoresheet').click());
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('jumps to either end, except the one the board is at', () => {
    const { button, onGoto, unmount } = renderDrawer(0);
    expect(button('Start').getAttribute('aria-disabled')).toBe('true');
    act(() => button('Latest').click());
    expect(onGoto).toHaveBeenCalledWith(2);
    unmount();
  });

  it('lists the moves it is given, each a step to its ply', () => {
    const { button, onGoto, unmount } = renderDrawer(2);
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
          <ScoresheetOpener {...props} />
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

  it('names the move on the board and says whether the drawer is open', () => {
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

describe('shownMove', () => {
  it('names the start, then White’s moves with a dot and Black’s with an ellipsis', () => {
    expect([shownMove(undefined, 0), shownMove('e4', 1), shownMove('c6', 2)]).toEqual([
      'Start',
      '1.e4',
      '1…c6',
    ]);
  });
});
