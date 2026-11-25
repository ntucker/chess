// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { NO_CHANGE } from '@/evaluation/evaluation';
import type { Candidate } from '@/lesson/select';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { CandidateList } from './CandidateList';

// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

// Silk's own tests cover how the list moves; these check what the list is told: one
// object per mount of it (a new key mounts a new one), and its layoutDependency.
const mockRenders: { list: object; dependency: unknown }[] = [];
jest.mock('@reactive/silk-native', () => {
  const silk = jest.requireActual<typeof import('@reactive/silk-native')>('@reactive/silk-native');
  const { useState } = jest.requireActual<typeof import('react')>('react');
  return {
    ...silk,
    MotionList: ({ layoutDependency, children }: Parameters<typeof silk.MotionList>[0]) => {
      const [list] = useState(() => ({}));
      mockRenders.push({ list, dependency: layoutDependency });
      return children;
    },
  };
});
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
  leadsAlways: false,
  density: 'comfortable',
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

/** Each row's text, and its label. */
function rows(props: Props) {
  return render(props, (host) =>
    [...host.querySelectorAll('[role="button"]')].map((button) => [
      button.textContent,
      button.getAttribute('aria-label'),
    ]),
  );
}

const SHARED = [
  { ...COMMON, share: 0.6 },
  { ...candidate('e2e4', 'e4'), share: 0.4 },
];

describe('CandidateList', () => {
  it('shows the wait on the row whose move picked the lesson loading, and on no other', () => {
    const waits = (loadingMove?: string) =>
      render({ candidates: SHARED, rare: [], loadingMove }, (host) =>
        [...host.querySelectorAll('[role="button"]')].map(
          (row) => row.querySelector('[role="progressbar"]')?.getAttribute('aria-label') ?? null,
        ),
      );
    expect(waits('e2e4')).toEqual([null, 'Loading the lesson.']);
    expect(waits()).toEqual([null, null]);
  });

  it("says Stockfish's verdict on a row in its badge and its label", () => {
    const verdicts = new Map([
      [
        'g1f3',
        {
          quality: 'inaccuracy',
          change: { label: '\u22120.4', description: '0.4 pawns worse for you' },
          loss: 0.06,
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

  it("points out the other side's marked mistake with its cost, once judged, where asked", () => {
    const mistake = { ...COMMON, move: { uci: 'g1f3', mistake: {} } } as Candidate;
    const verdicts = new Map([
      [
        'g1f3',
        {
          quality: 'blunder',
          change: { label: '+2.4', description: '2.4 pawns better for you' },
          loss: 0.26,
        },
      ] as const,
    ]);
    const read = (props: Props) =>
      render(props, (host) => {
        const row = host.querySelector('[role="button"]')!;
        return {
          cost: row.textContent!.includes('\u221226%'),
          label: row.getAttribute('aria-label'),
        };
      });
    const judged = 'Nf3, Stockfish: Blunder, 2.4 pawns better for you';
    expect(read({ candidates: [mistake], verdicts, opportunities: new Set(['g1f3']) })).toEqual({
      cost: true,
      label: `${judged}, An opportunity: this mistake gives away 26% of the winning chances`,
    });
    // Not yet judged: the dot alone. Not asked: an ordinary row.
    expect(read({ candidates: [mistake], opportunities: new Set(['g1f3']) })).toEqual({
      cost: false,
      label: 'Nf3',
    });
    expect(read({ candidates: [mistake], verdicts })).toEqual({ cost: false, label: judged });
    // A mistake Stockfish rates best gives nothing away, so it shows no cost.
    const best = new Map([
      [
        'g1f3',
        { quality: 'best', change: { label: '0.0', description: NO_CHANGE }, loss: -0.004 },
      ] as const,
    ]);
    expect(
      read({ candidates: [mistake], verdicts: best, opportunities: new Set(['g1f3']) }),
    ).toEqual({ cost: false, label: 'Nf3, Stockfish: Best move' });
  });

  it('heads the rows with whose moves they are, on a wide panel', () => {
    const text = render({ owner: 'White' }, (host) => host.textContent);
    expect(text).toContain("White's Likely replies");
  });

  it("only speaks a compact list's heading, which takes no room", () => {
    const heading = render({ owner: 'White', density: 'compact' }, (host) => {
      const text = [...host.querySelectorAll('div')].find(
        (div) => div.textContent === "White's Likely replies",
      )!;
      return { opacity: getComputedStyle(text).opacity, position: getComputedStyle(text).position };
    });
    expect(heading).toEqual({ opacity: '0', position: 'absolute' });
  });

  it('leaves where each row leads to the idea card in a compact list', () => {
    expect(rows({ density: 'compact' })[0]).toEqual(['Nf3', 'Nf3']);
  });

  it('keeps where each row leads in a compact list where nothing else names it', () => {
    expect(rows({ density: 'compact', leadsAlways: true })[0]).toEqual(['Nf3the Nf3 line', 'Nf3']);
  });

  it('folds the rare rows into a short last row in a compact list', () => {
    const toggle = (props: Props) => rows({ density: 'compact', ...props }).at(-1);
    expect(toggle({})).toEqual(['+1 more', 'Show 1 rarer replies']);
    expect(toggle({ rareShown: true })).toEqual(['Fewer', 'Hide rarer replies']);
  });

  it('says whose games the shares count on the heading, only while shares show', () => {
    const tip = 'Percentages: how often Lichess players rated 1400–1599 play each move.';
    const hint = (props: Props) =>
      render({ shareTip: tip, rare: [], ...props }, (host) => host.innerHTML.includes(tip));
    expect(hint({ candidates: SHARED })).toBe(true);
    // A lone move's share isn't shown, so there's nothing to explain.
    expect(hint({ candidates: [SHARED[0]!] })).toBe(false);
    // Nor beside Stockfish's row, which has no share.
    const best = {
      ...candidate('f8b4', 'Bb4+'),
      engine: { label: '0.0', description: 'No change' },
    };
    expect(hint({ candidates: [SHARED[0]!], engineBest: best })).toBe(false);
    expect(hint({ candidates: [COMMON, candidate('e2e4', 'e4')] })).toBe(false);
  });

  it('says whose games the shares count once, on the top share, in a compact list', () => {
    const tip = 'Percentages: who plays each move.';
    const tips = render(
      { candidates: SHARED, rare: [], shareTip: tip, density: 'compact' },
      (host) => host.innerHTML.split(tip).length - 1,
    );
    expect(tips).toBe(1);
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
    // A lone guide move shows no share, and the engine's row no change label: its star's tip says what it is.
    expect(rows({ rare: [], engineBest: best })).toEqual([
      ['Nf3the Nf3 line', 'Nf3'],
      [
        "Bb4+Top engine move: Stockfish's best reply here, not one the guide teaches.the Bb4+ line",
        'Bb4+, top engine move',
      ],
    ]);
  });

  describe('motion', () => {
    beforeEach(() => {
      mockRenders.length = 0;
    });
    /** Each render of the list: which mount it is (from 0), and the change it fades rows for. */
    const renders = () => {
      const mounts = [...new Set(mockRenders.map(({ list }) => list))];
      return mockRenders.map(({ list, dependency }) => [mounts.indexOf(list), dependency]);
    };

    it('fades rows in for showing rare ones, and starts a new position afresh', () => {
      const list = mount();
      list.show({ position: 'a' });
      list.show({ position: 'a', rareShown: true });
      list.show({ position: 'b' });
      list.unmount();
      expect(renders()).toEqual([
        [0, false],
        [0, true],
        [1, false],
      ]);
    });

    it('keeps the list and its change when a deeper search re-ranks rows, so they glide unfaded', () => {
      const other = candidate('d2d4', 'd4');
      const list = mount();
      list.show({ candidates: [COMMON, other] });
      list.show({ candidates: [other, COMMON] });
      list.unmount();
      expect(renders()).toEqual([
        [0, false],
        [0, false],
      ]);
    });
  });
});
