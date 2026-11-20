// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { themes } from '@/theme/theme';

import { StatusHeadline } from './GameStatus';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = Partial<Parameters<typeof StatusHeadline>[0]>;

/** Renders the headline, and reads its host with `read`. */
function render<T>(props: Props, read: (host: HTMLElement) => T) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <StatusHeadline eyebrow="Line" title="Your move." detail="Play here." {...props} />
      </SilkProvider>,
    ),
  );
  const result = read(host);
  act(() => root.unmount());
  return result;
}

/** The narrow part the headline renders, if any. */
function headlinePart(props: Props) {
  return render(props, (host) => host.firstElementChild?.getAttribute('data-narrow') ?? undefined);
}

/** What a short headline shows on a narrow page, and where its full form goes. */
function shortParts(props: Props) {
  return render({ short: true, ...props }, (host) => ({
    full: host
      .querySelector('[role="heading"]')
      ?.closest('[data-narrow]')
      ?.getAttribute('data-narrow'),
    line: host.querySelector('[data-narrow="narrow-only"]')?.textContent ?? undefined,
  }));
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

  describe('short', () => {
    it('runs the title into its detail on a narrow page, and keeps the full headline spoken', () => {
      expect(shortParts({ title: 'Off the guide.' })).toEqual({
        full: 'wide-only-spoken',
        line: 'Off the guide. Play here.',
      });
    });

    it('leaves out a title that only says whose move it is', () => {
      expect(shortParts({ turn: true }).line).toBe('Play here.');
    });

    it('draws no line for a routine headline', () => {
      expect(shortParts({ routine: true }).line).toBeUndefined();
    });
  });
});
