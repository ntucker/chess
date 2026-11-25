// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Candidate } from '@/lesson/select';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { CandidateList } from './CandidateList';

// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
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
    // jsdom has no layout and no Web Animations: each element sits 40px below the one before it
    // among its siblings, and each animation Silk's MotionList starts is recorded by what it
    // animates (opacity for a fade, translate for a glide).
    const animated: string[] = [];
    const { animate } = Element.prototype;
    const { getBoundingClientRect } = Element.prototype;
    beforeEach(() => {
      animated.length = 0;
      Element.prototype.animate = function (keyframes) {
        animated.push(Object.keys((keyframes as Keyframe[])[0]!).join());
        return {
          finished: Promise.resolve(),
          cancel: () => {},
          playState: 'running',
          currentTime: 0,
        } as unknown as Animation;
      };
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
        return { left: 0, top: index * 40, width: 100, height: 40 } as DOMRect;
      };
    });
    afterEach(() => {
      Element.prototype.animate = animate;
      Element.prototype.getBoundingClientRect = getBoundingClientRect;
    });
    const fades = () => animated.filter((what) => what === 'opacity').length;

    it('fades rows for showing rare ones, not for leaving a position that showed them', () => {
      const list = mount();
      list.show({ position: 'a' });
      list.show({ position: 'a', rareShown: true });
      // the one rare row arrives
      expect(fades()).toBe(1);
      animated.length = 0;
      // the next position mounts its own list: nothing animates the swap
      list.show({ position: 'b' });
      expect(animated).toEqual([]);
      list.unmount();
    });

    it('glides rows a deeper search re-ranks in one position, without fading', () => {
      const other = candidate('d2d4', 'd4');
      const list = mount();
      list.show({ candidates: [COMMON, other] });
      list.show({ candidates: [other, COMMON] });
      expect(animated).toContain('translate');
      expect(fades()).toBe(0);
      list.unmount();
    });
  });
});
