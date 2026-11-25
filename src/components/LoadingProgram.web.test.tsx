// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { LoadingProgram } from './LoadingProgram';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LoadingProgram', () => {
  it('tells screen readers what is loading, and shows no words but the eyebrow', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <SilkProvider theme={themes.dark}>
          <LoadingProgram eyebrow="Caro-Kann" label="Loading the lesson" />
        </SilkProvider>,
      ),
    );
    const bar = host.querySelector('[role=progressbar]');
    expect(bar?.getAttribute('aria-label')).toBe('Loading the lesson');
    expect(host.textContent).toBe('Caro-Kann');
    act(() => root.unmount());
  });
});
