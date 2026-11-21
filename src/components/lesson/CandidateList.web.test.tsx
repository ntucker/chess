// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Candidate } from '@/lesson/select';
import { themes } from '@/theme/theme';

import { CandidateList } from './CandidateList';

// Its react-native-svg needs Expo's asset registry, which the web preset doesn't resolve.
jest.mock('@/components/QualityBadge', () => ({ QualityBadge: () => null }));
// Records whether each change the rows' motion animates fades rows in and out.
const mockFades: boolean[] = [];
jest.mock('@/motion/reorder', () => ({
  measure: () => new Map(),
  reorder: (_before: unknown, _items: unknown, _spring: unknown, { fades }: { fades: boolean }) => {
    mockFades.push(fades);
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const candidate = (uci: string, san: string, rare?: boolean) =>
  ({ move: { uci }, san, from: uci.slice(0, 2), to: uci.slice(2), next: san, rare }) as Candidate;

const COMMON = candidate('g1f3', 'Nf3');
const RARE = candidate('h2h4', 'h4', true);

type Props = Partial<Parameters<typeof CandidateList>[0]>;

const DEFAULTS: Parameters<typeof CandidateList>[0] = {
  heading: 'Likely replies',
  position: 'start',
  candidates: [COMMON],
  rare: [RARE],
  rareShown: false,
  onShowRare: () => {},
  marks: new Map(),
  leadsTo: ({ san }) => `the ${san} line`,
  playable: false,
  onPlay: () => {},
  onPoint: () => {},
  onTabOut: () => {},
  compact: true,
};

/** A root that renders the list with `props` over the defaults, again on each call. */
function mount() {
  const host = document.createElement('div');
  const root = createRoot(host);
  return {
    host,
    show: (props: Props) =>
      act(() =>
        root.render(
          <SilkProvider theme={themes.dark}>
            <CandidateList {...DEFAULTS} {...props} />
          </SilkProvider>,
        ),
      ),
    unmount: () => act(() => root.unmount()),
  };
}

/** Renders the list, and reads its host with `read`. */
function render<T>(props: Props, read: (host: HTMLElement) => T) {
  const list = mount();
  list.show(props);
  const result = read(list.host);
  list.unmount();
  return result;
}

/** The text of the line under a compact list, if any. */
function caption(props: Props) {
  return render(props, (host) => host.querySelector('[data-narrow="narrow-only"]')?.textContent);
}

/** The text a part of the list holds, by part. */
function partTexts(props: Props) {
  return render(props, (host) =>
    [...host.querySelectorAll('[data-narrow]')].map((node) => [
      node.getAttribute('data-narrow'),
      node.textContent,
    ]),
  );
}

describe('CandidateList', () => {
  it('names where the pointed row leads', () => {
    expect(caption({ pointed: 'g1f3' })).toBe('Nf3: the Nf3 line');
  });

  it('names where a dragged rare move leads while its row is hidden', () => {
    expect(caption({ pointed: 'h2h4' })).toBe('h4: the h4 line');
  });

  it('keeps each row’s own line when the list is not compact', () => {
    expect(caption({ pointed: 'g1f3', compact: false })).toBeUndefined();
  });

  it('leaves whose moves out of the heading on a narrow page, but not out loud', () => {
    expect(partTexts({ owner: 'White' })).toContainEqual(['wide-only-spoken', "White's\u00a0"]);
  });

  it('leaves where each row leads to the line under a compact list on a narrow page', () => {
    expect(partTexts({})).toContainEqual(['wide-only', 'the Nf3 line']);
  });

  it('keeps where each row leads on every page when the list is not compact', () => {
    const parts = render({ compact: false }, (host) =>
      [...host.querySelectorAll('*')]
        .filter((node) => node.children.length === 0 && node.textContent === 'the Nf3 line')
        .map((node) => node.getAttribute('data-narrow')),
    );
    expect(parts).toEqual([null]);
  });

  it('fades rows for showing rare ones, not for leaving a position that showed them', () => {
    const list = mount();
    mockFades.length = 0;
    list.show({ position: 'a' });
    list.show({ position: 'a', rareShown: true });
    expect(mockFades).toEqual([true]);
    // the next position mounts its own list: nothing animates the swap
    list.show({ position: 'b' });
    expect(mockFades).toEqual([true]);
    list.unmount();
  });

  it('glides rows a deeper search re-ranks in one position, without fading', () => {
    const other = candidate('d2d4', 'd4');
    const list = mount();
    mockFades.length = 0;
    list.show({ candidates: [COMMON, other] });
    list.show({ candidates: [other, COMMON] });
    expect(mockFades).toEqual([false]);
    list.unmount();
  });
});
