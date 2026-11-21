// Renders Silk, which ships ES modules: the web project's transformIgnorePatterns
// (package.json) lets @reactive through Babel for it.
import { describe, expect, it } from '@jest/globals';
import { SilkProvider } from '@reactive/silk-native';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import type { LessonSource } from '@/lesson/lesson';
import { FIXTURE_INDEX } from '@/lesson/openings.fixture';
import { LessonIndexContext } from '@/resources/lesson';
import { themes } from '@/theme/theme';

import { SourceCredits } from './SourceCredits';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const study = (title: string, id: string): LessonSource => ({
  title,
  author: 'Matkun',
  url: `https://lichess.org/study/${id}`,
});

const CC_BY_SA = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };

/** The credits' text and link names, after pressing their show-all toggle `presses` times. */
function credits(sources: readonly LessonSource[], indexed: readonly LessonSource[], presses = 0) {
  const index = { ...FIXTURE_INDEX, slav: { ...FIXTURE_INDEX.slav, sources: indexed } };
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <SilkProvider theme={themes.dark}>
        <LessonIndexContext value={index}>
          <SourceCredits sources={sources} />
        </LessonIndexContext>
      </SilkProvider>,
    ),
  );
  for (let n = 0; n < presses; n++) {
    // A real <button>, so a keyboard reaches and presses it too.
    act(() => host.querySelector('button')!.click());
  }
  const text = host.textContent;
  const labels = [...host.querySelectorAll('[aria-label]')].map((link) =>
    link.getAttribute('aria-label'),
  );
  act(() => root.unmount());
  return { text, labels };
}

describe('SourceCredits', () => {
  it("names a lesson's study by its author when no other credited study shares the author", () => {
    const slav = study('Slav', 'slav');
    expect(credits([slav], [slav]).text).toBe("Lesson from Matkun's lichess study");
  });

  it('names it by its title where another lesson credits the same author', () => {
    expect(credits([study('Loaded', 'loaded')], [study('Slav', 'slav')]).text).toBe(
      'Lesson from Loaded by Matkun',
    );
  });

  it('credits two studies by one author together, numbered, each link named by its study', () => {
    const { text, labels } = credits([study('Loaded', 'loaded'), study('Other', 'other')], []);
    expect(text).toBe('Lesson from lichess studies by Matkun (1, 2)');
    expect(labels).toEqual(['1: Loaded', '2: Other']);
  });

  it('credits the license studies share after their authors', () => {
    const sources = [
      { ...study('Slav', 'slav'), license: CC_BY_SA },
      { ...study('Caro', 'caro'), author: 'wub1234', license: CC_BY_SA },
    ];
    expect(credits(sources, sources).text).toBe(
      'Lesson from lichess studies by Matkun and wub1234 (CC\u00a0BY-SA\u00a04.0)',
    );
  });

  it('credits one site at a time, Wikibooks pages under their book', () => {
    const page = (moves: string): LessonSource => ({
      title: `Chess Opening Theory, ${moves}`,
      author: 'Wikibooks contributors',
      url: `https://en.wikibooks.org/wiki/${moves}`,
      license: CC_BY_SA,
    });
    const sources = [
      study('Slav', 'slav'),
      page('1.e4 c6'),
      { ...study('Caro', 'caro'), author: 'wub1234' },
      page('1.e4 e5'),
    ];
    expect(credits(sources, sources).text).toBe(
      'Lesson from lichess studies by Matkun and wub1234; Chess Opening Theory by Wikibooks' +
        ' contributors (CC\u00a0BY-SA\u00a04.0): 1.e4\u00a0c6 and 1.e4\u00a0e5',
    );
  });

  it("joins a page label's moves with no-break spaces, all but those before a move number", () => {
    const page: LessonSource = {
      title: 'Chess Opening Theory, 1.d4 Nf6 2.c4 g6',
      author: 'Wikibooks contributors',
      url: 'https://en.wikibooks.org/wiki/long',
    };
    const sources = [
      page,
      { ...page, title: 'Chess Opening Theory, 1.e4', url: 'https://en.wikibooks.org/wiki/e4' },
    ];
    expect(credits(sources, sources).text).toBe(
      'Lesson from Chess Opening Theory by Wikibooks contributors: 1.d4\u00a0Nf6 2.c4\u00a0g6 and 1.e4',
    );
  });

  describe('a long list', () => {
    const page = (moves: string): LessonSource => ({
      title: `Chess Opening Theory, ${moves}`,
      author: 'Wikibooks contributors',
      url: `https://en.wikibooks.org/wiki/${moves}`,
      license: CC_BY_SA,
    });
    const sources = [
      ...['a', 'b', 'c', 'd'].map((id) => study(`Study ${id}`, id)),
      { ...study('Study e', 'e'), author: 'wub1234' },
      ...['1.e4', '1.d4', '1.c4', '1.Nf3'].map(page),
    ];

    it('starts as a count of each site, its license still linked', () => {
      expect(credits(sources, sources).text).toBe(
        'Lesson from 5 lichess studies and 4 pages of Chess Opening Theory by Wikibooks' +
          ' contributors (CC\u00a0BY-SA\u00a04.0) · Show all sources',
      );
    });

    it('shows every source on a press, and the counts again on another', () => {
      expect(credits(sources, sources, 1).text).toBe(
        'Lesson from lichess studies by Matkun (1, 2, 3, 4) and wub1234; Chess Opening Theory by' +
          ' Wikibooks contributors (CC\u00a0BY-SA\u00a04.0): 1.e4, 1.d4, 1.c4 and 1.Nf3 · Show fewer',
      );
      expect(credits(sources, sources, 2).text).toMatch(/^Lesson from 5 lichess studies/);
    });
  });

  it('lists many sources of different sites in full, since counting them saves nothing', () => {
    const lone = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id): LessonSource => ({
      title: id,
      author: id,
      url: `https://${id}.example/`,
    }));
    expect(credits(lone, lone).text).not.toMatch(/Show all/);
  });

  it('lists a short list in full, with no toggle', () => {
    const short = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => study(id, id));
    expect(credits(short, short).text).not.toMatch(/Show all/);
  });
});
