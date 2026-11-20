import { describe, expect, it } from '@jest/globals';

import { checkLesson } from './check';
import type { Color } from '@/game/replay';
import { positionHash } from '@/progress/progress';

import type { Lesson, LessonMove } from './lesson';
import {
  keyAfter,
  readShippedLesson,
  SAMPLE,
  shippedIds,
  uciLine,
  withMoves,
} from './lesson.fixture';
import { rowMarks } from './marks';
import {
  isPicking,
  lessonIndex,
  lessonOf,
  lessonsAfter,
  lessonsFrom,
  openingsLesson,
  withOpenings,
} from './openings';
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
    lines: [{ moves: uciLine('e4'), lineEnds: [] }],
  },
  slav: {
    title: 'Slav Defence',
    side: 'black',
    sources: [study('Matkun')],
    lines: [{ moves: uciLine('d4', 'd5', 'c4'), lineEnds: ['a'] }],
  },
  'anti-london': {
    title: 'Anti-London',
    side: 'black',
    sources: [study('Cold')],
    lines: [
      { moves: uciLine('d4', 'd5', 'Bf4'), lineEnds: ['b'] },
      { moves: uciLine('d4', 'd5', 'Nf3'), lineEnds: [] },
    ],
  },
  london: {
    title: 'London System',
    side: 'white',
    sources: [study('Enjoyer')],
    lines: [{ moves: uciLine('d4'), lineEnds: ['c'] }],
  },
} as const;

const startMoves = (lesson: Lesson) =>
  candidates(lesson, keyAfter(), undefined).map(({ move }) => move.uci);

/** A lesson of `side` whose guide plays each of `lines` (in SAN) and nothing else, its learner's moves all book. */
function guideLesson(id: string, side: Color, ...lines: string[][]): Lesson {
  const positions: Record<string, { variation: string; moves: LessonMove[] }> = {};
  for (const sans of lines) {
    sans.forEach((san, n) => {
      const key = keyAfter(...sans.slice(0, n));
      const uci = uciLine(...sans.slice(0, n + 1)).at(-1)!;
      const here = (positions[key] ??= { variation: id, moves: [] });
      const learner = (n % 2 === 0) === (side === 'white');
      if (!here.moves.some((move) => move.uci === uci))
        here.moves.push({ uci, ...(learner && { book: true }) });
    });
  }
  return {
    ...SAMPLE,
    id,
    side,
    variations: { [id]: { name: id } },
    positions,
  };
}

describe('lessonIndex', () => {
  const slav = guideLesson('slav', 'black', ['d4', 'd5', 'c4', 'c6']);
  const antiLondon = guideLesson(
    'anti',
    'black',
    ['d4', 'd5', 'Bf4', 'c5'],
    ['d4', 'd5', 'Nf3', 'Nf6'],
  );
  const caro = guideLesson('caro', 'black', ['e4', 'c6']);
  const london = guideLesson('london', 'white', ['d4', 'd5', 'Bf4']);
  const index = lessonIndex([caro, slav, antiLondon, london]);
  const lines = (id: string) => index[id].lines.map(({ moves }) => moves);

  it('picks a lesson by its first move no other lesson of its side plays there', () => {
    expect(lines('caro')).toEqual([uciLine('e4')]);
    expect(lines('slav')).toEqual([uciLine('d4', 'd5', 'c4')]);
    expect(lines('anti')).toEqual([uciLine('d4', 'd5', 'Bf4'), uciLine('d4', 'd5', 'Nf3')]);
    // The other side's lessons share nothing with it.
    expect(lines('london')).toEqual([uciLine('d4')]);
  });

  it('lists the line ends a clean run reaches through each line, as sorted hashes', () => {
    expect(index.slav.lines[0].lineEnds).toEqual([positionHash(keyAfter('d4', 'd5', 'c4', 'c6'))]);
    expect(index.london.lines[0].lineEnds).toEqual([positionHash(keyAfter('d4', 'd5', 'Bf4'))]);
  });

  it("lists none for a line through a learner's move a clean run would not play", () => {
    const unbooked = withMoves(slav, keyAfter('d4'), (moves) => moves.map(({ uci }) => ({ uci })));
    expect(lessonIndex([unbooked]).slav.lines).toEqual([{ moves: uciLine('d4'), lineEnds: [] }]);
  });

  it('gives two lessons with the same moves no line', () => {
    expect(lessonIndex([slav, { ...slav, id: 'copy' }]).copy.lines).toEqual([]);
  });

  it("names the lesson's title, side and sources", () => {
    expect(lessonIndex([SAMPLE])[SAMPLE.id]).toMatchObject({
      title: SAMPLE.title,
      side: 'black',
      sources: SAMPLE.sources,
    });
  });

  it.each(shippedIds)("agrees with walking %s's start for the start row's passed mark", (id) => {
    const lesson = readShippedLesson(id);
    const start = lessonView({ lesson, line: [], ply: 0, opponent: 1500 });
    for (const { moves, lineEnds } of lessonIndex([lesson])[id].lines) {
      // Every listed end passed passes the row; with one missing, it doesn't.
      const passedWith = (passed: readonly string[]) =>
        rowMarks(lesson, { seen: [], passed }, start).get(moves[0]);
      expect(passedWith(lineEnds)).toBe(lineEnds.length > 0 ? 'passed' : undefined);
      expect(passedWith(lineEnds.slice(1))).toBeUndefined();
    }
  });
});

describe('lessonOf', () => {
  it('picks the lesson of the side by the line it begins with, and none before one does', () => {
    expect(lessonOf(INDEX, 'black', uciLine('d4', 'd5', 'c4', 'c6'))).toBe('slav');
    expect(lessonOf(INDEX, 'black', uciLine('d4', 'd5', 'Nf3'))).toBe('anti-london');
    expect(lessonOf(INDEX, 'black', uciLine('e4'))).toBe('caro-kann');
    expect(lessonOf(INDEX, 'black', uciLine('d4', 'd5'))).toBeUndefined();
    expect(lessonOf(INDEX, 'black', uciLine('c4'))).toBeUndefined();
    expect(lessonOf(INDEX, 'black', [])).toBeUndefined();
    expect(lessonOf(INDEX, 'white', uciLine('d4', 'd5', 'c4'))).toBe('london');
  });
});

describe('isPicking', () => {
  it('holds before a line picks a lesson of the side, and on its moves', () => {
    expect(isPicking(INDEX, 'black', [])).toBe(true);
    expect(isPicking(INDEX, 'black', uciLine('d4', 'd5'))).toBe(true);
    expect(isPicking(INDEX, 'black', uciLine('d4', 'd5', 'c4'))).toBe(false);
    expect(isPicking(INDEX, 'black', uciLine('c4'))).toBe(false);
    expect(isPicking(INDEX, 'white', uciLine('d4'))).toBe(false);
  });
});

describe('lessonsAfter', () => {
  it('lists the lessons a line still leads to, or the one it picked', () => {
    expect(lessonsAfter(INDEX, 'black', uciLine('d4'))).toEqual(['slav', 'anti-london']);
    expect(lessonsAfter(INDEX, 'black', uciLine('d4', 'd5', 'c4', 'c6'))).toEqual(['slav']);
    expect(lessonsAfter(INDEX, 'black', uciLine('c4'))).toEqual([]);
  });
});

describe('lessonsFrom', () => {
  it('lists the lessons whose next move from the line leaves the square', () => {
    expect(lessonsFrom(INDEX, 'black', [], 'e2')).toEqual(['caro-kann']);
    expect(lessonsFrom(INDEX, 'black', [], 'd2')).toEqual(['slav', 'anti-london']);
    expect(lessonsFrom(INDEX, 'black', uciLine('d4', 'd5'), 'c1')).toEqual(['anti-london']);
    expect(lessonsFrom(INDEX, 'black', [], 'g1')).toEqual([]);
    expect(lessonsFrom(INDEX, 'white', [], 'd2')).toEqual(['london']);
  });
});

describe('openingsLesson', () => {
  it("lists the side's lessons' first moves in the index's order, and passes the checker", () => {
    const openings = openingsLesson(INDEX, 'black');
    expect(openings.side).toBe('black');
    expect(startMoves(openings)).toEqual(['e2e4', 'd2d4']);
    expect(checkLesson(openings)).toEqual([]);
    expect(startMoves(openingsLesson(INDEX, 'white'))).toEqual(['d2d4']);
  });

  it('lists the moves lessons share until a line picks one', () => {
    const { positions } = openingsLesson(INDEX, 'black');
    const ucis = (...sans: string[]) => positions[keyAfter(...sans)].moves.map(({ uci }) => uci);
    expect(ucis('d4')).toEqual(uciLine('d4', 'd5').slice(1));
    expect(ucis('d4', 'd5')).toEqual(['c2c4', 'c1f4', 'g1f3']);
    expect(positions[keyAfter('e4')]).toBeUndefined();
    expect(positions[keyAfter('d4', 'd5', 'c4')]).toBeUndefined();
  });

  it("books a learner's shared move a clean run goes on through", () => {
    const [d5] = openingsLesson(INDEX, 'black').positions[keyAfter('d4')].moves;
    expect(d5.book).toBe(true);
    const unpassable = {
      slav: { ...INDEX.slav, lines: [{ ...INDEX.slav.lines[0], lineEnds: [] }] },
      'anti-london': {
        ...INDEX['anti-london'],
        lines: INDEX['anti-london'].lines.map((line) => ({ ...line, lineEnds: [] })),
      },
    };
    const [unbooked] = openingsLesson(unpassable, 'black').positions[keyAfter('d4')].moves;
    expect(unbooked.book).toBeUndefined();
  });

  it("credits each opening's source in its move's note, each lesson a move leads to", () => {
    const [, d4] = openingsLesson(INDEX, 'black').positions[keyAfter()].moves;
    expect(d4.notes).toEqual([
      { text: "Slav Defence, from Matkun's lichess study." },
      { text: "Anti-London, from Cold's lichess study." },
    ]);
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
    const [slav] = openingsLesson(index, 'black').positions[keyAfter()].moves;
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
    const [slav] = openingsLesson(index, 'black').positions[keyAfter()].moves;
    expect(slav.notes?.[0].text).toBe(`Slav Defence, from ${credit}.`);
  });

  it("names a lichess study's license when it has one", () => {
    const license = { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
    const index = { slav: { ...INDEX.slav, sources: [{ ...study('Matkun'), license }] } };
    const [slav] = openingsLesson(index, 'black').positions[keyAfter()].moves;
    expect(slav.notes?.[0].text).toBe("Slav Defence, from Matkun's lichess study (CC0).");
  });

  it("credits the lessons' sources, a source two lessons share once", () => {
    const index = {
      ...INDEX,
      other: { ...INDEX.slav, sources: [study('Kampf'), study('Matkun')] },
    };
    expect(openingsLesson(index, 'black').sources).toEqual([
      study('Kampf'),
      study('Matkun'),
      study('Cold'),
    ]);
    // The other side's are another start's.
    expect(openingsLesson(index, 'white').sources).toEqual([study('Enjoyer')]);
  });
});

describe('withOpenings', () => {
  it("lists its side's openings at the lesson's start, its own move keeping what the file says", () => {
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
