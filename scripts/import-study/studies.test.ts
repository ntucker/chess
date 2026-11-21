import { describe, expect, it } from '@jest/globals';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { Chapter } from './study';
import { lessonInfo, STUDIES, type StudySource, type WikibooksSource } from './studies';
import { titleCase } from './wikibooks';

describe('lessonInfo', () => {
  it('credits a study the recipe reads twice once, where it first comes', () => {
    const study = {
      study: 'abcd1234',
      credit: { title: 'A study', author: 'someone', url: 'https://lichess.org/study/abcd1234' },
    };
    const info = lessonInfo({
      info: STUDIES.sicilian.info,
      from: [
        { ...study, chapters: () => true },
        { root: 'Chess_Opening_Theory/1._e4/1...c5' },
        { ...study, chapters: () => true, writtenFor: 'white' },
      ],
    });
    expect(info.sources.map(({ url }) => url)).toEqual([
      'https://lichess.org/study/abcd1234',
      'https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4/1...c5',
    ]);
  });
});

describe('STUDIES', () => {
  // Without them a rerun on another machine asks again, and can book other moves or count other games.
  it("commits every recipe's answers files, so its import rebuilds the same lesson", () => {
    const missing = Object.values(STUDIES).flatMap(({ info: { id } }) =>
      ['', '-explain', '-stockfish', '-explorer']
        .map((step) => `answers/${id}${step}.jsonl`)
        .filter((file) => !existsSync(join(__dirname, file))),
    );
    expect(missing).toEqual([]);
  });

  it('names the Caro-Kann Tal chapter alike from the study and from Wikibooks', () => {
    const { from } = STUDIES['caro-kann'];
    const study = from.find((source): source is StudySource => 'study' in source);
    const wikibooks = from.find((source): source is WikibooksSource => 'root' in source);
    // A copy of the study's chapter title; if lichess retitles it, the rebuild's diff shows that.
    const title = '🔵 14 Advance Variation: Tal Variation (4.h4) & Bayonet Attack (4.g4)';
    expect(study?.chapterName?.(title, {} as Chapter)).toBe(
      `Advance Variation: ${titleCase(wikibooks?.rename?.['Tal variation'] ?? '')}`,
    );
  });
});
