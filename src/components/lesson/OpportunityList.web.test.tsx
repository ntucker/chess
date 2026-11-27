// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it, jest } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { Lesson, Uci } from '@/lesson/lesson';
import { readShippedLesson, uciLine } from '@/lesson/lesson.fixture';
import { lessonOpportunities } from '@/lesson/opportunities';
import type { Find } from '@/opportunity/finder';
import { cueOf, savedFind } from '@/opportunity/saved';
import { positionHash, UNTOUCHED } from '@/progress/progress';
import { SettingsProvider } from '@/settings/SettingsProvider';
import { themes } from '@/theme/theme';

import { type FinderProps, OpportunityList, type SavedProps } from './OpportunityList';

// Its font needs Expo's asset registry too.
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STAFFORD = readShippedLesson('stafford');
/** The 1400 band, which the finder's limits were tuned at. */
const BAND = 2;
/** The board at the lesson's start: every row ahead. */
const START: readonly Uci[] = [];

type Props = Parameters<typeof OpportunityList>[0];

/** A finder run from the board's position and done, with nothing found. */
const DONE: FinderProps = {
  run: { finds: [], running: false },
  from: 'here',
  source: { from: 'maia', rating: 1500 },
  onFind: () => {},
};

/** Nothing saved. */
const NONE_SAVED: SavedProps = { finds: [], onSave: () => {}, onUnsave: () => {} };

/** A find after the Stafford's 4...dxc6: 5.d3 Bc5 6.Be2 Qd4 7.O-O Bg4?, punished by 8.Bxg4. */
const FIND: Find = {
  line: [
    'e2e4',
    'e7e5',
    'g1f3',
    'g8f6',
    'f3e5',
    'b8c6',
    'e5c6',
    'd7c6',
    'd2d3',
    'f8c5',
    'f1e2',
  ].concat(['d8d4', 'e1g1']),
  mistake: 'c8g4',
  replies: ['e2g4'],
  payoff: ['f6g4', 'd1g4', 'e8g8'],
  disagreements: [],
  end: 0.93,
  holds: true,
  reach: 0.12,
  onGuide: true,
  share: 0.1,
  cost: 0.17,
  found: 0.34,
  gain: 0.12,
  estimate: true,
  score: 0.0014,
};

/** Scholar's mate as a find: 3...Nf6?, punished by 4.Qxf7#. */
const SCHOLAR = uciLine('e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#');
const MATE: Find = {
  ...FIND,
  line: SCHOLAR.slice(0, 5),
  mistake: SCHOLAR[5],
  replies: [SCHOLAR[6]],
  payoff: [],
};

/** The list with one find from elsewhere, `FIND` with its gain at `gain`, as its last row. */
const foundAt = (gain: number): Partial<Props> => ({
  finder: { ...DONE, from: 'elsewhere', run: { finds: [{ ...FIND, gain }], running: false } },
});

/** `lesson` with no gain on any marked mistake, as a trap is before the importer measures it. */
const unmeasured = (lesson: Lesson): Lesson => ({
  ...lesson,
  positions: Object.fromEntries(
    Object.entries(lesson.positions).map(([key, entry]) => [
      key,
      {
        ...entry,
        moves: entry.moves.map(({ mistake, ...move }) =>
          mistake ? { ...move, mistake: { ...mistake, gain: undefined } } : move,
        ),
      },
    ]),
  ),
});

/** The finder's button, named by its tooltip. */
const FIND_TIP = 'Find opportunities from this position';
/** A row's bookmark, saving the find or forgetting it, named by its tooltip. */
const SAVE_TIP = 'Save this find: the lesson then plays it like its own';
const UNSAVE_TIP = 'Remove from saved';
const CONTROLS = [FIND_TIP, SAVE_TIP, UNSAVE_TIP];

/** Renders the Stafford lesson's list with `props`, and reads its host with `read`. */
function render<T>(props: Partial<Props>, read: (host: HTMLElement) => T): T {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <SettingsProvider>
          <OpportunityList
            lesson={STAFFORD}
            band={BAND}
            line={START}
            progress={UNTOUCHED}
            players="Lichess players rated 1400–1599"
            onPlay={() => {}}
            saved={NONE_SAVED}
            finder={DONE}
            density="comfortable"
            {...props}
          />
        </SettingsProvider>
      </SilkProvider>,
    ),
  );
  const result = read(host);
  act(() => root.unmount());
  return result;
}

/** The list's rows in `host`, leaving out its buttons: the finder's and the bookmarks. */
const rowsIn = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[role="button"]')].filter(
    (row) => !CONTROLS.includes(row.getAttribute('aria-label')!),
  );

/** The aria-labels of the list's rows in `host`. */
const labelsIn = (host: HTMLElement) => rowsIn(host).map((row) => row.getAttribute('aria-label'));

/** The bookmarks in `host` named `tip`. */
const bookmarksIn = (host: HTMLElement, tip: string) => [
  ...host.querySelectorAll<HTMLElement>(`[aria-label="${tip}"]`),
];

const labels = (props: Partial<Props> = {}) => render(props, labelsIn);

const text = (props: Partial<Props>) => render(props, (host) => host.textContent ?? '');

describe('OpportunityList', () => {
  const ranked = lessonOpportunities(STAFFORD, BAND, []);

  it('lists the ranked opportunities, each saying the moves before it and its meters aloud', () => {
    const said = labels();
    expect(said).toHaveLength(ranked.length);
    const bg5 = said.find((label) => label?.includes('6.Bg5'));
    expect(bg5).toMatch(
      /^6\.Bg5, after 5\.d3 Bc5, arrives in 3\.9% of games, falls for it 15% of the time, knowing it gains 13%, punished with mate$/,
    );
  });

  it("names each meter's column in its tooltip, over rows only", () => {
    const columns = [
      'Arrive: how often',
      'Fall for it: once your game arrives',
      'Gain: each time the opponent falls for it',
    ];
    const shown = text({});
    for (const column of columns) expect(shown).toContain(column);
    // Each takes keyboard focus, which opens its tip.
    const focusable = render({}, (host) =>
      [...host.querySelectorAll('[tabindex="0"]')].map((el) => el.textContent ?? ''),
    );
    for (const column of columns)
      expect(focusable.some((tip) => tip.startsWith(column))).toBe(true);
    // A lesson that marks no mistake, with nothing saved or found: no rows, so no columns.
    const antiLondon = readShippedLesson('anti-london');
    const empty = text({ lesson: antiLondon });
    for (const column of columns) expect(empty).not.toContain(column);
    // Its saved or found finds alone are rows too.
    const saved = { ...NONE_SAVED, finds: [savedFind(FIND, DONE.source)] };
    expect(text({ lesson: antiLondon, saved })).toContain(columns[0]);
    const found = { ...DONE, run: { finds: [FIND], running: false } };
    expect(text({ lesson: antiLondon, finder: found })).toContain(columns[0]);
  });

  it('shows and says what knowing a row is worth, a dash where not measured', () => {
    const worth = (props: Partial<Props>) =>
      render(props, (host) => rowsIn(host).at(-1)!.textContent);
    expect(worth(foundAt(0.17))).toMatch(/\+17%$/);
    expect(render(foundAt(0.17), labelsIn).at(-1)).toContain('knowing it gains 17%');
    // Under 10%, a tenth, as reach and share show it, so the three multiply as they rank.
    expect(worth(foundAt(0.053))).toMatch(/\+5\.3%$/);
    expect(render(foundAt(0.053), labelsIn).at(-1)).toContain('knowing it gains 5.3%');
    // A punishment that mates is marked beside its move.
    const titles = render({}, (host) => rowsIn(host).map((row) => row.textContent ?? ''));
    expect(titles[0]).toMatch(/^6\.Bc4 #/);
    expect(titles[2]).not.toContain('#');
    expect(worth({ lesson: unmeasured(readShippedLesson('london')) })).toMatch(/\u2013$/);
  });

  it("plays a row's line when it is pressed", () => {
    const onPlay = jest.fn<(line: readonly Uci[]) => void>();
    render({ onPlay }, (host) => {
      act(() => host.querySelector<HTMLElement>('[role="button"]')!.click());
    });
    expect(onPlay).toHaveBeenCalledWith(ranked[0].line);
  });

  it('marks a row seen once its cue was shown', () => {
    const progress = { seen: [positionHash(ranked[0].next)], passed: [] };
    expect(labels({ progress })[0]).toMatch(/, seen$/);
  });

  it("lists the finder's finds after the lesson's, and plays one through its mistake", () => {
    const onPlay = jest.fn<(line: readonly Uci[]) => void>();
    const finder = { ...DONE, run: { finds: [FIND, MATE], running: false } };
    const said = render({ finder, onPlay }, (host) => {
      const rows = rowsIn(host);
      act(() => rows.at(-2)!.click());
      return rows.map((row) => row.getAttribute('aria-label'));
    });
    expect(said).toHaveLength(ranked.length + 2);
    expect(said.at(-2)).toMatch(
      /^7\.\.\.Bg4, after 6\.\.\.Qd4 7\.O-O, arrives in 12% of games, falls for it 10% of the time, knowing it gains 12%$/,
    );
    expect(said.at(-1)).toMatch(/^3\.\.\.Nf6, after 2\.\.\.Nc6 3\.Qh5, .*, punished with mate$/);
    expect(onPlay).toHaveBeenCalledWith([...FIND.line, FIND.mistake]);
  });

  it('leaves out a find the lesson already lists', () => {
    const [first] = ranked;
    const again: Find = { ...FIND, line: first.line.slice(0, -1), mistake: first.line.at(-1)! };
    const finder = { ...DONE, run: { finds: [again], running: false } };
    expect(labels({ finder })).toHaveLength(ranked.length);
  });

  it("leaves out a find the lesson marks once the board is past it, as the lesson's own row is", () => {
    const [first] = ranked;
    const again: Find = { ...FIND, line: first.line.slice(0, -1), mistake: first.line.at(-1)! };
    const past = { line: first.line };
    const ahead = lessonOpportunities(STAFFORD, BAND, first.line).length;
    const finder = { ...DONE, run: { finds: [again], running: false } };
    expect(labels({ ...past, finder })).toHaveLength(ahead);
    const saved = { ...NONE_SAVED, finds: [savedFind(again, DONE.source)] };
    expect(labels({ ...past, saved })).toHaveLength(ahead);
    // Off the guide, nothing is left to list: no rows, so no column heads.
    const offGuide = text({ line: uciLine('d4'), finder, saved });
    expect(offGuide).not.toContain('Arrive: how often');
  });

  it('leaves out a find that reaches a listed position by another order of moves', () => {
    // 1.e4 Nf6 2.Nf3 e5 for 1.e4 e5 2.Nf3 Nf6: the same position after the mistake.
    const swapped = (line: readonly Uci[]) => [
      line[0],
      line[3],
      line[2],
      line[1],
      ...line.slice(4),
    ];
    const bg5 = ranked.find(({ san }) => san === 'Bg5')!;
    const transposed: Find = {
      ...FIND,
      line: swapped(bg5.line.slice(0, -1)),
      mistake: bg5.line.at(-1)!,
    };
    const finder = { ...DONE, run: { finds: [transposed, FIND], running: false } };
    expect(labels({ finder })).toHaveLength(ranked.length + 1);
  });

  it('runs the finder from a position it has not run from, and is disabled where it runs', () => {
    const onFind = jest.fn();
    const button = (from: FinderProps['from']) =>
      render({ finder: { ...DONE, from, onFind } }, (host) => {
        const found = host.querySelector<HTMLElement>(`[aria-label="${FIND_TIP}"]`)!;
        act(() => found.click());
        return found;
      });
    button('none');
    button('elsewhere');
    expect(onFind).toHaveBeenCalledTimes(2);
    button('here');
    expect(onFind).toHaveBeenCalledTimes(2);
  });

  it('says what the finder is doing: searching, done with nothing, or found elsewhere', () => {
    const searching = text({ finder: { ...DONE, run: { finds: [], running: true } } });
    expect(searching).toContain('the first finds take a few minutes');
    expect(searching).not.toContain('No opportunity found');
    expect(text({})).toContain('No opportunity found from here.');
    const elsewhere = render(foundAt(FIND.gain), (host) => ({
      text: host.textContent ?? '',
      labels: labelsIn(host),
    }));
    expect(elsewhere.text).toContain('From another position');
    expect(elsewhere.labels.at(-1)).toMatch(/^7\.\.\.Bg4/);
    // A run whose only find the lesson already lists found something: no "nothing found".
    const [first] = ranked;
    const again: Find = { ...FIND, line: first.line.slice(0, -1), mistake: first.line.at(-1)! };
    expect(text({ finder: { ...DONE, run: { finds: [again], running: false } } })).not.toContain(
      'No opportunity found',
    );
  });

  it("names the replies' source on its chip: Maia's estimate, or lichess's counted games", () => {
    const shown = text({});
    expect(shown).toContain('Maia 1500');
    expect(shown).toContain('Sign in with lichess to count real games');
    const counted = text({ finder: { ...DONE, source: { from: 'lichess', band: 1400 } } });
    expect(counted).toContain('lichess 1400–1599');
    expect(counted).toContain('Counted: how often lichess players rated 1400–1599');
  });

  it('says when the search stopped short, and retries it from the button', () => {
    const retry = jest.fn();
    const finder = { ...DONE, run: { finds: [], running: false, retry } };
    const said = render({ finder }, (host) => {
      act(() => host.querySelector<HTMLElement>(`[aria-label="Try again"]`)!.click());
      return host.textContent ?? '';
    });
    expect(said).toContain('The search stopped short: an engine failed.');
    expect(said).not.toContain('No opportunity found');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("saves a finder's find from its bookmark, with the run's source", () => {
    const onSave = jest.fn<(find: Find) => void>();
    const finder = { ...DONE, run: { finds: [FIND], running: false } };
    render({ finder, saved: { ...NONE_SAVED, onSave } }, (host) => {
      expect(bookmarksIn(host, UNSAVE_TIP)).toHaveLength(0);
      act(() => bookmarksIn(host, SAVE_TIP)[0].click());
    });
    expect(onSave).toHaveBeenCalledWith(FIND);
  });

  it("lists the saved finds under their source after the lesson's, in place of the finder's", () => {
    const onUnsave = jest.fn();
    const kept = savedFind(FIND, { from: 'lichess', band: 1400 });
    const saved = { ...NONE_SAVED, finds: [kept], onUnsave };
    const finder = { ...DONE, run: { finds: [FIND, MATE], running: false } };
    const shown = render({ finder, saved }, (host) => {
      act(() => bookmarksIn(host, UNSAVE_TIP)[0].click());
      return {
        text: host.textContent ?? '',
        labels: labelsIn(host),
        saves: bookmarksIn(host, SAVE_TIP),
      };
    });
    expect(onUnsave).toHaveBeenCalledWith(cueOf(kept));
    expect(shown.text).toMatch(/Saved.*lichess 1400–1599.*From this position.*Maia 1500/);
    // The saved find, then the finder's other find alone.
    expect(shown.labels).toHaveLength(ranked.length + 2);
    expect(shown.labels.at(-2)).toMatch(/^7\.\.\.Bg4/);
    expect(shown.labels.at(-1)).toMatch(/^3\.\.\.Nf6/);
    expect(shown.saves).toHaveLength(1);
  });

  it('lets the lesson list a saved find it marks too, and forget it from its row', () => {
    const [first] = ranked;
    const again: Find = { ...FIND, line: first.line.slice(0, -1), mistake: first.line.at(-1)! };
    const onUnsave = jest.fn();
    const saved = { ...NONE_SAVED, finds: [savedFind(again, DONE.source)], onUnsave };
    const shown = render({ saved }, (host) => {
      act(() => bookmarksIn(host, UNSAVE_TIP)[0].click());
      return { text: host.textContent ?? '', labels: labelsIn(host) };
    });
    expect(shown.labels).toHaveLength(ranked.length);
    expect(shown.text).not.toContain('Saved');
    expect(onUnsave).toHaveBeenCalledWith(first.next);
  });
});
