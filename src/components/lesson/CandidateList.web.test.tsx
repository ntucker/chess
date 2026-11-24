// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Candidate } from '@/lesson/select';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes, typography } from '@/theme/theme';

import { CandidateList, listMinWidth } from './CandidateList';

// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
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
            <SettingsProvider>
              <CandidateList {...DEFAULTS} {...props} />
            </SettingsProvider>
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

  it("says Stockfish's verdict on a row in its badge and its label", () => {
    const verdicts = new Map([
      [
        'g1f3',
        {
          quality: 'inaccuracy',
          change: { label: '\u22120.4', description: '0.4 pawns worse for you' },
        },
      ] as const,
    ]);
    const read = (host: HTMLElement) => ({
      badge: host.querySelector('[aria-label="Inaccuracy"]') !== null,
      row: host.querySelector('[role="button"]')?.getAttribute('aria-label'),
    });
    expect(render({ verdicts }, read)).toEqual({
      badge: true,
      row: 'Nf3, Stockfish: Inaccuracy, 0.4 pawns worse for you',
    });
    // A row still being judged has neither.
    expect(render({}, read)).toEqual({ badge: false, row: 'Nf3' });
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

  it('says whose games the shares count on the heading, only while shares show', () => {
    const tip = 'Percentages: how often Lichess players rated 1400–1599 play each move.';
    const shared = [
      { ...COMMON, share: 0.6 },
      { ...candidate('e2e4', 'e4'), share: 0.4 },
    ];
    const hint = (props: Props) =>
      render({ shareTip: tip, rare: [], ...props }, (host) => host.innerHTML.includes(tip));
    expect(hint({ candidates: shared })).toBe(true);
    // A lone move's share isn't shown, so there's nothing to explain.
    expect(hint({ candidates: [shared[0]!] })).toBe(false);
    // Nor beside Stockfish's row, which has no share.
    const best = {
      ...candidate('f8b4', 'Bb4+'),
      engine: { label: '0.0', description: 'No change' },
    };
    expect(hint({ candidates: [shared[0]!], engineBest: best })).toBe(false);
    expect(hint({ candidates: [COMMON, candidate('e2e4', 'e4')] })).toBe(false);
  });

  it('leaves the info mark out of a narrow pane, keeping the tip on the heading', () => {
    const shared = [
      { ...COMMON, share: 0.6 },
      { ...candidate('e2e4', 'e4'), share: 0.4 },
    ];
    const wideOnly = (shareTip?: string) =>
      render(
        { candidates: shared, rare: [], ...(shareTip ? { shareTip } : {}) },
        (host) => host.querySelectorAll('[data-narrow="wide-only"]').length,
      );
    expect(wideOnly('Percentages: who plays each move.')).toBe(wideOnly() + 1);
  });

  it("shows a Stockfish row's change label, and says its description", () => {
    const engine = {
      ...COMMON,
      engine: { label: '\u22120.4', description: '0.4 pawns worse for you' },
    };
    const row = render({ candidates: [engine], rare: [] }, (host) => {
      const button = host.querySelector('[role="button"]');
      return [button?.textContent, button?.getAttribute('aria-label')];
    });
    expect(row).toEqual(['Nf3the Nf3 line\u22120.4', 'Nf3, 0.4 pawns worse for you']);
  });

  it("lists Stockfish's moves after the guide's, marked as top engine moves", () => {
    const best = {
      ...candidate('f8b4', 'Bb4+'),
      engine: { label: '0.0', description: 'No change' },
    };
    const rows = render({ rare: [], engineBest: best }, (host) =>
      [...host.querySelectorAll('[role="button"]')].map((button) => [
        button.textContent,
        button.getAttribute('aria-label'),
      ]),
    );
    // A lone guide move shows no share, and the engine's row no change label: its star's tip says what it is.
    expect(rows).toEqual([
      ['Nf3the Nf3 line', 'Nf3'],
      [
        "Bb4+Top engine move: Stockfish's best reply here, not one the guide teaches.the Bb4+ line",
        'Bb4+, top engine move',
      ],
    ]);
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

  // CANDIDATES in the heading's caption, uppercase: its glyphs in Instrument Sans, 76.1 px at
  // 12 px as measured in Chromium (measure again if the font or the eyebrow's style changes),
  // and Eyebrow's letter spacing, which text scaling leaves alone.
  const headingWord = (fontScale: number) =>
    (76.1 / 12) * typography.caption.size * fontScale + 'CANDIDATES'.length * 1.6;

  it.each([1, 1.3, 1.8, 2])(
    'leaves room in a narrow pane for the heading’s longest word at text scale %f',
    (fontScale) => {
      expect(listMinWidth(fontScale)).toBeGreaterThanOrEqual(headingWord(fontScale));
    },
  );
});
