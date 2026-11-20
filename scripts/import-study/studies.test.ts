import { describe, expect, it } from '@jest/globals';

import { lessonInfo, STUDIES } from './studies';

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
