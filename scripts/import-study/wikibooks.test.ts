import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { parsePgn } from 'chessops/pgn';

import { SAMPLE } from '@/lesson/lesson.fixture';

import { extractChapter } from './extract';
import { mergeChapters } from './merge';
import { parseStudy } from './study';
import { plainText, readPage, segmentSan, titleCase, wikibooksPgn } from './wikibooks';

const ROOT = 'Chess_Opening_Theory/1._d4/1...d5';

/** A page's wiki source: the position template, a heading, then `body`. */
const page = (heading: string, body: string, responses = '') =>
  `{{Chess Opening Theory/Position|=\n|name=Name|eco=[[Chess/ECOD|D06]]${responses}}}\n==${heading}==\n${body}`;

const PAGES: Record<string, string> = {
  [ROOT]: page(
    '1...d5 · Closed Game',
    [
      'Black claims the centre at once, the classical answer to the queen pawn.',
      "The most common reply is [[/2. c4/]], the Queen's Gambit, offering a pawn for the centre.",
      'White may also play [[/2. Nf3|2.Nf3]], a quieter move that keeps options open.',
    ].join('\n\n'),
  ),
  [`${ROOT}/2._c4`]: page(
    "2. c4 · Queen's Gambit",
    'White strikes at the centre from the side and invites Black to take on c4.\n\n* [[/2...e6/]] keeps the centre firm and solid for the long game.\n* [[/2...c6/|2...c6]] supports the d5 pawn with another pawn.',
  ),
  [`${ROOT}/2._c4/2...e6`]: '#REDIRECT [[Chess Opening Theory/1. d4/1...e6/2. c4/2...d5]]',
  ['Chess_Opening_Theory/1._d4/1...e6/2._c4/2...d5']: page(
    "2...d5 · Queen's Gambit Declined",
    "A long text about the Queen's Gambit Declined that the Slav lesson should not see.",
  ),
  [`${ROOT}/2._c4/2...c6`]: page(
    '2...c6 · Slav Defence',
    'Black keeps the light-squared bishop free to develop outside the pawn chain.\n\n==Theory table==\n|line1=3. Nf3 Nf6 4. Nc3 dxc4?! 5. a4 ...\n|line2=3. Nf3 Qxh7 4. e4',
  ),
};

const fetchPage = async (title: string) => PAGES[title];

describe('segmentSan', () => {
  it('reads the move of a title or link segment', () => {
    expect(segmentSan('5._a4')).toBe('a4');
    expect(segmentSan('5...Bf5')).toBe('Bf5');
    expect(segmentSan('2. c4')).toBe('c4');
    expect(segmentSan('Chess_Opening_Theory')).toBeUndefined();
  });
});

describe('plainText', () => {
  it('keeps link labels and moves, drops templates, references and bold', () => {
    expect(
      plainText("'''Bold''' [[/5. a4/]] and [[/5...Bf5|the bishop]]{{Wikipedia}}<ref>A book</ref>"),
    ).toBe('Bold 5.a4 and the bishop');
  });
});

describe('titleCase', () => {
  it('capitalises words as the lichess guides do, but not minor words or moves', () => {
    expect(titleCase('Dutch variation')).toBe('Dutch Variation');
    expect(titleCase("Queen's gambit declined")).toBe("Queen's Gambit Declined");
    expect(titleCase('4.Nd2 and 4.c4 sidelines')).toBe('4.Nd2 and 4.c4 Sidelines');
    expect(titleCase('exchange variation, 4.cxd5')).toBe('Exchange Variation, 4.cxd5');
  });
});

describe('readPage', () => {
  it('reads the name, next moves, paragraphs about one move and table lines', () => {
    const read = readPage(PAGES[`${ROOT}/2._c4`]);
    expect(read.name).toBe("Queen's Gambit");
    expect(read.next).toEqual(['e6', 'c6']);
    expect(read.text).toEqual([
      'White strikes at the centre from the side and invites Black to take on c4.',
    ]);
    expect(read.about.get('c6')).toEqual(['2...c6 supports the d5 pawn with another pawn.']);
    expect(readPage(PAGES[`${ROOT}/2._c4/2...c6`]).lines).toEqual([
      ['Nf3', 'Nf6', 'Nc3', 'dxc4?!', 'a4'],
      ['Nf3', 'Qxh7', 'e4'],
    ]);
  });

  it('reads a table line\'s "..." as the move above it, and keeps glyphs', () => {
    const table =
      '|line1=9. Qe2 Nbd7 10. e4\n|line2=9. ... Bg6? 10. Ne5\n|line3=9. ... ... 10. ... ...';
    expect(readPage(page('9.Qe2', table)).lines).toEqual([
      ['Qe2', 'Nbd7', 'e4'],
      ['Qe2', 'Bg6?', 'Ne5'],
      ['Qe2', 'Bg6?', 'Ne5'],
    ]);
  });
});

describe('wikibooksPgn', () => {
  const games = async (leave: string[] = []) =>
    parsePgn(await wikibooksPgn(fetchPage, { root: ROOT, learner: 'black', leave, log: () => {} }));

  it('cuts chapters at named positions on the main path', async () => {
    const chapters = await games();
    // The root page's position is the lesson's own; 2...e6 transposes, so 2...c6 is the main move.
    expect(chapters.map((game) => game.headers.get('ChapterName'))).toEqual([
      '',
      "Queen's Gambit",
      "Queen's Gambit: Slav Defence",
    ]);
  });

  it('renames positions, and an empty name starts no chapter', async () => {
    const pgn = await wikibooksPgn(fetchPage, {
      root: ROOT,
      learner: 'black',
      rename: { "Queen's Gambit": '', 'Slav Defence': 'Slav' },
      log: () => {},
    });
    expect(parsePgn(pgn).map((game) => game.headers.get('ChapterName'))).toEqual(['', 'Slav']);
  });

  it("names the root page's chapter by `topName`, and nests the others under it", async () => {
    const pgn = await wikibooksPgn(fetchPage, {
      root: ROOT,
      learner: 'black',
      topName: 'Closed',
      log: () => {},
    });
    expect(parsePgn(pgn).map((game) => game.headers.get('ChapterName'))).toEqual([
      'Closed',
      "Closed: Queen's Gambit",
      "Closed: Queen's Gambit: Slav Defence",
    ]);
  });

  it('puts a paragraph about one next move on that move, and the rest on the move in', async () => {
    const [top] = await games();
    const d5 = top.moves.children[0].children[0];
    expect(d5.data.comments?.[0]).toMatch(/^Black claims the centre/);
    const [c4, nf3] = d5.children;
    expect(c4.data.comments).toBeUndefined(); // c4 heads its own chapter
    expect(nf3.data.comments?.[0]).toMatch(/^White may also play 2\.Nf3/);
  });

  it('keeps a redirect as a leaf, and leaves a position another lesson covers', async () => {
    const [, gambit] = await games(["Queen's Gambit Declined"]);
    const c4 = gambit.moves.children[0].children[0].children[0];
    // The redirect goes last, so that it is never the main move.
    const [c6, e6] = c4.children;
    expect(e6.data.san).toBe('e6');
    expect(e6.children).toEqual([]);
    expect(e6.data.comments?.[0]).toMatch(/keeps the centre firm/);
    // 2...c6 heads its own chapter.
    expect(c6.children).toEqual([]);
  });

  it("extends the tree with the table's lines, each up to its first illegal move", async () => {
    const chapters = await games(["Queen's Gambit Declined"]);
    const slav = chapters.find(
      (game) => game.headers.get('ChapterName') === "Queen's Gambit: Slav Defence",
    )!;
    let at = slav.moves;
    const sans: string[][] = [];
    const nags: number[] = [];
    while (at.children.length > 0) {
      sans.push(at.children.map((child) => child.data.san));
      const [main] = at.children;
      nags.push(...(main.data.nags ?? []));
      at = main;
    }
    // The table's ?! on 4...dxc4 marks it dubious.
    expect(nags).toEqual([6]);
    expect(sans).toEqual([
      ['d4'],
      ['d5'],
      ['c4'],
      ['c6'],
      ['Nf3'],
      ['Nf6'],
      ['Nc3'],
      ['dxc4'],
      ['a4'],
    ]);
  });
});

/** Real pages (fixtures/wikibooks/), which have what made-up ones missed. */
describe('real Wikibooks pages', () => {
  const real = (name: string) =>
    readFileSync(join(__dirname, 'fixtures/wikibooks', `${name}.wiki`), 'utf8');
  const NC3 = 'Chess_Opening_Theory/1._d4/1...d5/2._c4/2...c6/3._Nf3/3...Nf6/4._Nc3';

  it('never makes a redirect the main move, though the page lists it first', async () => {
    const pages: Record<string, string> = {
      [NC3]: real('4._Nc3'),
      [`${NC3}/4...e6`]: real('4...e6'),
    };
    const pgn = await wikibooksPgn(async (title) => pages[title], {
      root: NC3,
      learner: 'black',
      log: () => {},
    });
    const chapters = parseStudy(pgn, () => true);
    const lesson = mergeChapters(
      { id: 'test', title: 'Test', side: 'black', sources: SAMPLE.sources },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
      () => undefined,
    );
    const afterNc3 = Object.values(lesson.positions).find((position) =>
      position.moves.some(({ uci }) => uci === 'e7e6'),
    )!;
    expect(afterNc3.moves.filter(({ book }) => book).map(({ uci }) => uci)).toEqual(['d5c4']);
  });

  it('reads a theory table\'s "..." as the move above it', () => {
    expect(readPage(real('table-ditto')).lines).toEqual([
      ['Qe2', 'Nbd7', 'e4', 'Bg6', 'Bd3', 'Bh5', 'e5', 'Nd5'],
      ['Qe2', 'Bg6', 'Ne5', 'Nbd7', 'Nxg6', 'hxg6'],
      ['Nh4', 'Nbd7', 'Nxf5', 'exf5', 'Qc2', 'g6'],
    ]);
  });
});
