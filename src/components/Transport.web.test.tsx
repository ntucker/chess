// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { Pressable, SilkProvider } from '@reactive/silk-native';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { Transport } from './Transport';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Each button's label, with the narrow part around it. */
function buttons(props: ComponentProps<typeof Transport>) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <Transport {...props} />
      </SilkProvider>,
    ),
  );
  const found = [...host.querySelectorAll('[role=button]')].map((button) => ({
    label: button.getAttribute('aria-label'),
    part: button.closest('[data-narrow]')?.getAttribute('data-narrow'),
  }));
  act(() => root.unmount());
  return found;
}

const goto = () => {};

describe('Transport', () => {
  it('shows all four buttons everywhere without a scoresheet', () => {
    expect(
      buttons({ ply: 1, total: 2, onGoto: goto }).map(({ label, part }) => [label, part]),
    ).toEqual([
      ['First move', undefined],
      ['Back', undefined],
      ['Forward', undefined],
      ['Latest move', undefined],
    ]);
  });

  it('puts its middle in the jumps’ place on a narrow page', () => {
    const middle = <Pressable accessibilityRole="button" accessibilityLabel="Middle" />;
    expect(
      buttons({ ply: 1, total: 2, onGoto: goto, middle }).map(({ label, part }) => [label, part]),
    ).toEqual([
      ['First move', 'wide-only'],
      ['Back', undefined],
      ['Middle', 'narrow-only'],
      ['Forward', undefined],
      ['Latest move', 'wide-only'],
    ]);
  });
});
