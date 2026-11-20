// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { StatusHeadline } from './GameStatus';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The narrow part the headline renders, if any. */
function headlinePart(props: Partial<Parameters<typeof StatusHeadline>[0]>) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <StatusHeadline eyebrow="Line" title="Your move." detail="" {...props} />
      </SilkProvider>,
    ),
  );
  const part = host.firstElementChild?.getAttribute('data-narrow') ?? undefined;
  act(() => root.unmount());
  return part;
}

describe('StatusHeadline', () => {
  it('keeps a routine headline for screen readers only on a narrow page', () => {
    expect(headlinePart({ routine: true })).toBe('wide-only-spoken');
  });

  it('draws a headline with news', () => {
    expect(headlinePart({})).toBeUndefined();
  });

  it('draws a routine headline when the opponent failed, so its retry shows', () => {
    const failure = { who: 'Maia', error: new Error('down'), onRetry: () => {} };
    expect(headlinePart({ routine: true, failure })).toBeUndefined();
  });
});
