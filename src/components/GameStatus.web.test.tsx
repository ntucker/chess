// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { NEW_VERSION, NewVersionError } from '@/files/newVersion';
import { themes } from '@/theme/theme';

import { StatusHeadline } from './GameStatus';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Props = Partial<Parameters<typeof StatusHeadline>[0]>;

/** Mounts a headline in `host`, which `draw` redraws with new props. */
function mount() {
  const host = document.createElement('div');
  const root = createRoot(host);
  const draw = (props: Props) =>
    act(() =>
      root.render(
        <SilkProvider theme={themes.dark}>
          <StatusHeadline eyebrow="Line" title="Your move." detail="Play here." {...props} />
        </SilkProvider>,
      ),
    );
  return { host, draw, unmount: () => act(() => root.unmount()) };
}

/** Renders the headline, and reads its host with `read`. */
function render<T>(props: Props, read: (host: HTMLElement) => T) {
  const { host, draw, unmount } = mount();
  draw(props);
  const result = read(host);
  unmount();
  return result;
}

/**
 * What a narrow page draws: the headline's own part, the full headline's,
 * and the short line, hidden from screen readers.
 */
function narrowParts(props: Props) {
  return render(props, (host) => ({
    headline: host.firstElementChild?.getAttribute('data-narrow') ?? undefined,
    full: host
      .querySelector('[role="heading"]')
      ?.closest('[data-narrow]')
      ?.getAttribute('data-narrow'),
    line: host.querySelector('[data-narrow="narrow-only"][aria-hidden="true"]')?.textContent,
  }));
}

describe('StatusHeadline', () => {
  it('draws what it leads to under it', () => {
    expect(render({ action: <span>Review the game</span> }, (host) => host.textContent)).toContain(
      'Play here.Review the game',
    );
  });

  it('draws the full headline on a narrow page without news', () => {
    expect(narrowParts({})).toEqual({ headline: undefined, full: undefined, line: undefined });
  });

  it('runs the title into its detail, and keeps the full headline for screen readers', () => {
    expect(narrowParts({ title: 'Off the guide.', news: 'all' })).toEqual({
      headline: undefined,
      full: 'wide-only-spoken',
      line: 'Off the guide. Play here.',
    });
  });

  it('draws the detail alone when only it is news', () => {
    expect(narrowParts({ news: 'detail' }).line).toBe('Play here.');
  });

  it('keeps the headline for screen readers only when none of it is news', () => {
    expect(narrowParts({ news: 'none' })).toMatchObject({
      headline: 'wide-only-spoken',
      line: undefined,
    });
  });

  it('draws the detail beside a failure, so its retry has a reason', () => {
    const failure = { who: 'Maia', error: new Error('down'), onRetry: () => {} };
    expect(narrowParts({ news: 'none', failure })).toMatchObject({
      headline: undefined,
      line: 'Play here.',
    });
  });

  it.each([
    ['a retry', new Error('down'), "Maia didn't answer.Try again"],
    ['a reload', new NewVersionError(), `${NEW_VERSION}Reload`],
    [
      'what the app needs',
      new NewVersionError({ needs: 'an app update' }),
      'Maia needs an app update.',
    ],
  ])('offers %s for a failure', (_, error, said) => {
    const failure = { who: 'Maia', error, onRetry: () => {} };
    const line = render(
      { failure },
      (host) => host.firstElementChild?.lastElementChild?.textContent,
    );
    expect(line).toBe(said);
  });
  it('announces the title with its tip, in one live region that stays as the tip comes', () => {
    const { host, draw, unmount } = mount();
    draw({});
    const live = host.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('Your move.');
    draw({ title: 'A brief appearance.', titleTip: 'Too few moves.' });
    expect(host.querySelector('[aria-live="polite"]')).toBe(live);
    expect(live?.textContent).toBe('A brief appearance.Too few moves.');
    unmount();
  });
});
