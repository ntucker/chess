// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { Transport } from './Transport';

// Its font needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Each button's label, with the narrow part around it and whether it is disabled or expanded. */
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
    disabled: button.getAttribute('aria-disabled') === 'true',
    expanded: button.getAttribute('aria-expanded') ?? undefined,
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

  it('puts the scoresheet opener in the jumps’ place on a narrow page', () => {
    const found = buttons({
      ply: 1,
      total: 2,
      onGoto: goto,
      scoresheet: { label: '1.e4', open: true, onToggle: () => {} },
    });
    expect(found.map(({ label, part }) => [label, part])).toEqual([
      ['First move', 'wide-only'],
      ['Back', undefined],
      ['Scoresheet, 1.e4', 'narrow-only'],
      ['Forward', undefined],
      ['Latest move', 'wide-only'],
    ]);
    expect(found[2].expanded).toBe('true');
  });

  it('has nothing to open before the first move', () => {
    const [, , opener] = buttons({
      ply: 0,
      total: 0,
      onGoto: goto,
      scoresheet: { label: 'Start', open: false, onToggle: () => {} },
    });
    expect(opener).toMatchObject({ label: 'Scoresheet, Start', disabled: true, expanded: 'false' });
  });
});
