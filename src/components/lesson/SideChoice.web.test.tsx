// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Color } from '@/game/replay';
import { themes } from '@/theme/theme';

import { SideChoice } from './SideChoice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('SideChoice', () => {
  it('checks the side played, and offers the other', () => {
    const onChange = jest.fn<(side: Color) => void>();
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <SilkProvider theme={themes.dark}>
          <SideChoice side="white" onChange={onChange} />
        </SilkProvider>,
      ),
    );
    const radios = [...host.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(radios.map((radio) => [radio.textContent, radio.getAttribute('aria-checked')])).toEqual([
      ['White', 'true'],
      ['Black', 'false'],
    ]);
    act(() => radios[1].click());
    expect(onChange).toHaveBeenCalledWith('black');
    act(() => root.unmount());
  });
});
