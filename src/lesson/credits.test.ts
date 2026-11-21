import { describe, expect, it } from '@jest/globals';

import { creditGroups } from './credits';
import type { LessonSource } from './lesson';

const study = (author: string, id: string): LessonSource => ({
  title: `Study ${id}`,
  author,
  url: `https://lichess.org/study/${id}`,
});

const LICENSE = { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' };
const page = (moves: string): LessonSource => ({
  title: `Chess Opening Theory, ${moves}`,
  author: 'Wikibooks contributors',
  url: `https://en.wikibooks.org/wiki/Chess_Opening_Theory/${moves.replaceAll(' ', '/')}`,
  license: LICENSE,
});

describe('creditGroups', () => {
  it('keeps a source alone as it is', () => {
    const only = study('Matkun', 'a');
    expect(creditGroups([only, page('1.e4 c6')])).toEqual([
      { kind: 'source', source: only },
      { kind: 'source', source: page('1.e4 c6') },
    ]);
  });

  it('credits lichess studies together, each author once with their studies in order', () => {
    const [a, b, c] = [study('Matkun', 'a'), study('Bosburp', 'b'), study('Matkun', 'c')];
    expect(creditGroups([a, b, c])).toEqual([
      {
        kind: 'studies',
        authors: [
          { author: 'Matkun', studies: [a, c] },
          { author: 'Bosburp', studies: [b] },
        ],
      },
    ]);
  });

  it('credits pages of one site, author and license under the title they share', () => {
    const [e4, d4] = [page('1.e4 c6'), page('1.d4 d5 2.c4 c6')];
    expect(creditGroups([e4, d4])).toEqual([
      {
        kind: 'pages',
        title: 'Chess Opening Theory',
        author: 'Wikibooks contributors',
        license: LICENSE,
        pages: [
          { label: '1.e4 c6', source: e4 },
          { label: '1.d4 d5 2.c4 c6', source: d4 },
        ],
      },
    ]);
  });

  it('labels pages by their whole titles when they share none', () => {
    const pgn = (title: string): LessonSource => ({
      title,
      author: 'ntucker',
      url: `https://github.com/ntucker/chess/${title}.pgn`,
    });
    const group = creditGroups([pgn('Bowdler'), pgn('Hillbilly')])[0];
    expect(group).toMatchObject({ kind: 'pages', title: undefined, author: 'ntucker' });
    expect(group.kind === 'pages' && group.pages.map(({ label }) => label)).toEqual([
      'Bowdler',
      'Hillbilly',
    ]);
  });

  it('puts each group where its first source was', () => {
    const groups = creditGroups([
      study('A', 'a'),
      page('1.e4 c6'),
      study('B', 'b'),
      page('1.e4 e5'),
    ]);
    expect(groups.map(({ kind }) => kind)).toEqual(['studies', 'pages']);
  });
});
