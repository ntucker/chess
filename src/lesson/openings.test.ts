import { describe, expect, it } from '@jest/globals';

import { checkLesson } from './check';
import { keyAfter, readShippedLesson, SAMPLE, shippedIds, uciLine } from './lesson.fixture';
import { rowMarks } from './marks';
import { indexEntry, lessonOf, lessonsFrom, openingsLesson, withOpenings } from './openings';
import { candidates } from './select';
import { lessonView } from './view';

const study = (author: string) => ({
  title: 'A study',
  author,
  url: `https://lichess.org/study/${author}`,
});
const INDEX = {
  'caro-kann': {
    title: 'Caro-Kann Defence',
    side: 'black',
    sources: [study('Kampf')],
    firstMoves: ['e2e4'],
    lineEnds: {},
  },
  slav: {
    title: 'Slav Defence',
    side: 'black',
    sources: [study('Matkun')],
    firstMoves: ['d2d4'],
    lineEnds: {},
  },
} as const;

const startMoves = (lesson: typeof SAMPLE) =>
  candidates(lesson, keyAfter(), undefined).map(({ move }) => move.uci);

describe('lessonOf', () => {
  it('picks the lesson by its first move, and none before one', () => {
    expect(lessonOf(INDEX, uciLine('d4', 'd5', 'c4'))).toBe('slav');
    expect(lessonOf(INDEX, uciLine('e4'))).toBe('caro-kann');
    expect(lessonOf(INDEX, uciLine('c4'))).toBeUndefined();
    expect(lessonOf(INDEX, [])).toBeUndefined();
  });
});

describe('lessonsFrom', () => {
  it('lists the lessons whose first move leaves the square', () => {
    expect(lessonsFrom(INDEX, 'e2')).toEqual(['caro-kann']);
    expect(lessonsFrom(INDEX, 'd2')).toEqual(['slav']);
    expect(lessonsFrom(INDEX, 'g1')).toEqual([]);
  });
});

describe('openingsLesson', () => {
  it("lists every lesson's first moves in the index's order, and passes the checker", () => {
    const openings = openingsLesson(INDEX);
    expect(openings.side).toBe('black');
    expect(startMoves(openings)).toEqual(['e2e4', 'd2d4']);
    expect(checkLesson(openings)).toEqual([]);
  });

  it("credits each opening's source in its move's note", () => {
    const [, slav] = openingsLesson(INDEX).positions[keyAfter()].moves;
    expect(slav.notes).toEqual([{ text: "Slav Defence, from Matkun's lichess study." }]);
  });

  it('credits every source, with the license of one that has it', () => {
    const wikibooks = {
      title: 'Wikibooks Chess Opening Theory',
      author: 'Wikibooks contributors',
      url: 'https://en.wikibooks.org/wiki/Chess_Opening_Theory',
      license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
    };
    const index = {
      slav: { ...INDEX.slav, sources: [study('Matkun'), study('Kitsune'), wikibooks] },
    };
    const [slav] = openingsLesson(index).positions[keyAfter()].moves;
    expect(slav.notes).toEqual([
      {
        text: "Slav Defence, from Matkun's lichess study, Kitsune's lichess study and Wikibooks Chess Opening Theory by Wikibooks contributors (CC BY-SA 4.0).",
      },
    ]);
  });

  it.each([
    ['https://lichess.org/study/abcd1234', "Matkun's lichess study"],
    ['http://lichess.org/study/abcd1234', "Matkun's lichess study"],
    ['https://www.lichess.org/study/abcd1234', "Matkun's lichess study"],
    ['https://lichess.org/@/Matkun', 'A study by Matkun'],
    ['https://lichess.org.example.com/study/abcd1234', 'A study by Matkun'],
  ])('credits %s as %s', (url, credit) => {
    const index = { slav: { ...INDEX.slav, sources: [{ ...study('Matkun'), url }] } };
    const [slav] = openingsLesson(index).positions[keyAfter()].moves;
    expect(slav.notes?.[0].text).toBe(`Slav Defence, from ${credit}.`);
  });

  it("names a lichess study's license when it has one", () => {
    const license = { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
    const index = { slav: { ...INDEX.slav, sources: [{ ...study('Matkun'), license }] } };
    const [slav] = openingsLesson(index).positions[keyAfter()].moves;
    expect(slav.notes?.[0].text).toBe("Slav Defence, from Matkun's lichess study (CC0).");
  });

  it("credits the lessons' sources, a source two lessons share once", () => {
    const index = {
      ...INDEX,
      other: { ...INDEX.slav, sources: [study('Kampf'), study('Matkun')] },
    };
    expect(openingsLesson(index).sources).toEqual([study('Kampf'), study('Matkun')]);
  });
});

describe('withOpenings', () => {
  it("lists every opening at the lesson's start, its own move keeping what the file says", () => {
    const lesson = withOpenings(SAMPLE, INDEX);
    expect(startMoves(lesson)).toEqual(['e2e4', 'd2d4']);
    const own = (l: typeof SAMPLE) =>
      l.positions[keyAfter()].moves.find(({ uci }) => uci === 'e2e4')!;
    expect(own(lesson)).toEqual({
      ...own(SAMPLE),
      notes: [
        { text: "Caro-Kann Defence, from Kampf's lichess study." },
        ...(own(SAMPLE).notes ?? []),
      ],
    });
    expect(lesson.positions[keyAfter('e4')]).toBe(SAMPLE.positions[keyAfter('e4')]);
    expect(checkLesson(lesson)).toEqual([]);
  });
});

describe('indexEntry', () => {
  it("names the lesson's title, side, sources and first moves", () => {
    expect(indexEntry(SAMPLE)).toEqual({
      title: SAMPLE.title,
      side: 'black',
      sources: SAMPLE.sources,
      firstMoves: ['e2e4'],
      lineEnds: { e2e4: expect.any(Array) },
    });
  });

  it('lists the line ends a clean run reaches through each first move, as hashes', () => {
    const ends = indexEntry(SAMPLE).lineEnds.e2e4;
    expect(ends.length).toBeGreaterThan(0);
    expect(new Set(ends).size).toBe(ends.length);
    expect(ends).toEqual([...ends].sort());
  });

  it.each(shippedIds)("agrees with walking %s's start for the start row's passed mark", (id) => {
    const lesson = readShippedLesson(id);
    const start = lessonView({ lesson, line: [], ply: 0, opponent: 1500 });
    const { lineEnds } = indexEntry(lesson);
    for (const [uci, ends] of Object.entries(lineEnds)) {
      // Every listed end passed passes the row; with one missing, it doesn't.
      const passedWith = (passed: readonly string[]) =>
        rowMarks(lesson, { seen: [], passed }, start).get(uci);
      expect(passedWith(ends)).toBe(ends.length > 0 ? 'passed' : undefined);
      expect(passedWith(ends.slice(1))).toBeUndefined();
    }
  });
});
