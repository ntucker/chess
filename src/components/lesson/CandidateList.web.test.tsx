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

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const candidate = (uci: string, san: string, rare?: boolean) =>
  ({ move: { uci }, san, from: uci.slice(0, 2), to: uci.slice(2), next: san, rare }) as Candidate;

const COMMON = candidate('g1f3', 'Nf3');
const RARE = candidate('h2h4', 'h4', true);

type Props = Partial<Parameters<typeof CandidateList>[0]>;

/** Renders the list, and reads its host with `read`. */
function render<T>(props: Props, read: (host: HTMLElement) => T) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <CandidateList
          heading="Likely replies"
          candidates={[COMMON]}
          rare={[RARE]}
          rareShown={false}
          onShowRare={() => {}}
          marks={new Map()}
          leadsTo={({ san }) => `the ${san} line`}
          playable={false}
          onPlay={() => {}}
          onPoint={() => {}}
          onTabOut={() => {}}
          compact
          {...props}
        />
      </SilkProvider>,
    ),
  );
  const result = read(host);
  act(() => root.unmount());
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

  it('leaves where each row leads to the line under a compact list', () => {
    expect(partTexts({}).filter(([part]) => part === 'leads-to')).toEqual([]);
    expect(partTexts({ compact: false })).toContainEqual(['leads-to', 'the Nf3 line']);
  });
});
