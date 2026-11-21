import { describe, expect, it } from '@jest/globals';

import { checkLesson } from './check';
import { positionHash } from '@/progress/progress';

import type { Lesson } from './lesson';
import {
  keyAfter,
  readShippedLesson,
  SAMPLE,
  shippedIds,
  uciLine,
  withMoves,
} from './lesson.fixture';
import { rowMarks } from './marks';
import { FIXTURE_INDEX, guideLesson } from './openings.fixture';
import {
  type IndexEntry,
  isPicking,
  pickingMoves,
  lessonIndex,
  lessonOf,
  lessonsAfter,
  lessonsFrom,
  openingsLesson,
  variationHref,
  variationLine,
  withOpenings,
} from './openings';
import { candidates, lineKeys } from './select';
import { lessonView } from './view';

const study = (author: string) => ({
  title: 'A study',
  author,
  url: `https://lichess.org/study/${author}`,
});
/** An index line through `sans`, picking its lesson where they end. */
const line = (sans: string[], lineEnds: string[] = []) => ({
  moves: uciLine(...sans),
  picked: positionHash(keyAfter(...sans)),
  lineEnds,
});

const INDEX = {
  'caro-kann': {
    title: 'Caro-Kann Defence',
    side: 'black',
    sources: [study('Kampf')],
    variations: [],
    lines: [line(['e4'])],
  },
  slav: {
    title: 'Slav Defence',
    side: 'black',
    sources: [study('Matkun')],
    variations: [],
    lines: [line(['d4', 'd5', 'c4'], ['a'])],
  },
  'anti-london': {
    title: 'Anti-London',
    side: 'black',
    sources: [study('Cold')],
    variations: [],
    lines: [line(['d4', 'd5', 'Bf4'], ['b']), line(['d4', 'd5', 'Nf3'])],
  },
  london: {
    title: 'London System',
    side: 'white',
    sources: [study('Enjoyer')],
    variations: [],
    lines: [line(['d4'], ['c'])],
  },
} as const;

const startMoves = (lesson: Lesson) =>
  candidates(lesson, keyAfter(), undefined).map(({ move }) => move.uci);

/** A shipped lesson's index entry on its own, built once: building it searches every variation. */
const shippedIndexes = new Map<string, IndexEntry>();
function shippedIndex(id: string): IndexEntry {
  let entry = shippedIndexes.get(id);
  if (!entry) {
    entry = lessonIndex([readShippedLesson(id)])[id];
    shippedIndexes.set(id, entry);
  }
  return entry;
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
    expect(lessonIndex([unbooked]).slav.lines).toEqual([
      { moves: uciLine('d4'), picked: positionHash(keyAfter('d4')), lineEnds: [] },
    ]);
  });

  it("picks no lesson by a learner's move its guide warns against", () => {
    // The Slav's guide shows 1...Nf6 too, as no book move.
    const warned = withMoves(slav, keyAfter('d4'), (moves) => [...moves, { uci: 'g8f6' }]);
    expect(lessonIndex([warned, antiLondon]).slav.lines.map(({ moves }) => moves)).toEqual([
      uciLine('d4', 'd5', 'c4'),
    ]);
  });

  it('refuses two lessons of a side with the same moves, since no line picks either', () => {
    expect(() => lessonIndex([slav, { ...slav, id: 'copy' }])).toThrow('No moves pick slav, copy');
  });

  it('names the position each line picks its lesson at', () => {
    expect(index.anti.lines.map(({ picked }) => picked)).toEqual([
      positionHash(keyAfter('d4', 'd5', 'Bf4')),
      positionHash(keyAfter('d4', 'd5', 'Nf3')),
    ]);
  });

  it('opens a variation at the line games play most, the learner keeping to book moves', () => {
    const caroLines = guideLesson(
      'caro',
      'black',
      ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'],
      ['e4', 'c6', 'd4', 'd5', 'Nc3', 'g6'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'Qxd5'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Nf3'],
    );
    const at = (...sans: string[]) => caroLines.positions[keyAfter(...sans)];
    const counted = (sans: string[], games: Record<string, number>) => ({
      ...at(...sans),
      moves: at(...sans).moves.map((move) => ({
        ...move,
        games: [games[move.uci] ?? 0],
        book: move.book && move.uci !== 'd8d5', // ...Qxd5
      })),
    });
    const tag = (variation: string, ...sans: string[]) => ({
      [keyAfter(...sans)]: {
        ...(caroLines.positions[keyAfter(...sans)] ?? { moves: [] }),
        variation,
      },
    });
    const lesson: Lesson = {
      ...caroLines,
      variations: {
        caro: { name: 'Caro' },
        classical: { name: 'Classical', parent: 'caro' },
        exchange: { name: 'Exchange', parent: 'caro' },
      },
      positions: {
        ...caroLines.positions,
        // Nc3 is played far more than exd5; after it, dxe4 far more than g6.
        [keyAfter('e4', 'c6', 'd4')]: counted(['e4', 'c6', 'd4'], {
          [uciLine('e4', 'c6', 'd4', 'd5').at(-1)!]: 100,
        }),
        [keyAfter('e4', 'c6', 'd4', 'd5')]: counted(['e4', 'c6', 'd4', 'd5'], {
          [uciLine('e4', 'c6', 'd4', 'd5', 'Nc3').at(-1)!]: 90,
          [uciLine('e4', 'c6', 'd4', 'd5', 'exd5').at(-1)!]: 10,
        }),
        [keyAfter('e4', 'c6', 'd4', 'd5', 'Nc3')]: counted(['e4', 'c6', 'd4', 'd5', 'Nc3'], {
          [uciLine('e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4').at(-1)!]: 95,
          [uciLine('e4', 'c6', 'd4', 'd5', 'Nc3', 'g6').at(-1)!]: 5,
        }),
        // Qxd5, the shorter way into the Exchange, is no book move.
        [keyAfter('e4', 'c6', 'd4', 'd5', 'exd5')]: counted(['e4', 'c6', 'd4', 'd5', 'exd5'], {
          [uciLine('e4', 'c6', 'd4', 'd5', 'exd5', 'Qxd5').at(-1)!]: 50,
          [uciLine('e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5').at(-1)!]: 50,
        }),
        ...tag('classical', 'e4', 'c6', 'd4', 'd5', 'Nc3', 'g6'),
        ...tag('classical', 'e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'),
        ...tag('exchange', 'e4', 'c6', 'd4', 'd5', 'exd5', 'Qxd5'),
        ...tag('exchange', 'e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Nf3'),
      },
    };
    const lines = Object.fromEntries(
      lessonIndex([lesson]).caro.variations.map(({ id, moves }) => [id, moves]),
    );
    expect(lines.classical).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'));
    expect(lines.exchange).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'Nf3'));
  });

  it('lists each variation reached, through a line that picks the lesson, the shortest where games are not counted', () => {
    const caroLines = guideLesson(
      'caro',
      'black',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
    );
    const caroTagged: Lesson = {
      ...caroLines,
      variations: {
        caro: { name: 'Caro' },
        unused: { name: 'Unused', parent: 'caro' },
        exchange: { name: 'Exchange', parent: 'caro' },
        advance: { name: 'Advance', parent: 'unused' },
      },
      positions: {
        ...caroLines.positions,
        [keyAfter('e4', 'c6', 'd4', 'd5', 'e5')]: {
          ...caroLines.positions[keyAfter('e4', 'c6', 'd4', 'd5', 'e5')],
          variation: 'advance',
        },
        [keyAfter('e4', 'c6', 'd4', 'd5', 'exd5')]: {
          ...caroLines.positions[keyAfter('e4', 'c6', 'd4', 'd5', 'exd5')],
          variation: 'exchange',
        },
      },
    };
    // In the file's order; a variation no position is in is left out, its
    // children passed to its parent.
    expect(lessonIndex([caroTagged]).caro.variations).toEqual([
      { id: 'caro', name: 'Caro', moves: uciLine('e4') },
      {
        id: 'exchange',
        name: 'Exchange',
        parent: 'caro',
        moves: uciLine('e4', 'c6', 'd4', 'd5', 'exd5'),
      },
      {
        id: 'advance',
        name: 'Advance',
        parent: 'caro',
        moves: uciLine('e4', 'c6', 'd4', 'd5', 'e5'),
      },
    ]);
    // The positions before a line picks it are the lesson's too, but open nothing.
    expect(index.anti.variations).toEqual([
      { id: 'anti', name: 'anti', moves: uciLine('d4', 'd5', 'Bf4') },
    ]);
  });

  /** `lesson` with the positions after each of `lines` (in SAN) in `variation`. */
  const inVariation = (lesson: Lesson, variation: string, ...lines: string[][]): Lesson => ({
    ...lesson,
    positions: {
      ...lesson.positions,
      ...Object.fromEntries(
        lines.map((sans) => [
          keyAfter(...sans),
          { ...lesson.positions[keyAfter(...sans)], variation },
        ]),
      ),
    },
  });

  it("tries the learner's book moves from every line before any move", () => {
    const caro = guideLesson(
      'caro',
      'black',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3'],
      ['e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'c3'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'],
    );
    const c5 = uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'c5').at(-1);
    const noBookC5 = withMoves(caro, keyAfter('e4', 'c6', 'd4', 'd5', 'e5'), (moves) =>
      moves.map((move) => ({ ...move, book: move.uci !== c5 })),
    );
    const lesson = inVariation(
      inVariation(
        {
          ...noBookC5,
          variations: {
            caro: { name: 'Caro' },
            adv: { name: 'Adv', parent: 'caro' },
            v: { name: 'V', parent: 'adv' },
          },
        },
        'adv',
        ['e4', 'c6', 'd4', 'd5', 'e5'],
      ),
      'v',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'c5'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
    );
    // Past the parent's line only ...c5, no book move, reaches it; book moves from the start do.
    expect(lessonIndex([lesson]).caro.variations.find(({ id }) => id === 'v')!.moves).toEqual(
      uciLine('e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'),
    );
  });

  it('ranks a reply without counts below one played in a game at its position', () => {
    const caro = guideLesson(
      'caro',
      'black',
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'],
      ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3'],
      ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4'],
    );
    // 3.Nc3's many games leave 3.e5's ten a tiny share, but still above none.
    const games: Record<string, number[]> = {
      [uciLine('e4', 'c6', 'd4', 'd5', 'e5').at(-1)!]: [10],
      [uciLine('e4', 'c6', 'd4', 'd5', 'Nc3').at(-1)!]: [100_000_000],
    };
    const counted = withMoves(caro, keyAfter('e4', 'c6', 'd4', 'd5'), (moves) =>
      moves.map((move) => (games[move.uci] ? { ...move, games: games[move.uci] } : move)),
    );
    const lesson = inVariation(
      { ...counted, variations: { caro: { name: 'Caro' }, v: { name: 'V', parent: 'caro' } } },
      'v',
      ['e4', 'c6', 'd4', 'd5', 'exd5'],
      ['e4', 'c6', 'd4', 'd5', 'e5'],
    );
    // 3.exd5, first in the guide but never counted, comes after 3.e5.
    expect(lessonIndex([lesson]).caro.variations.find(({ id }) => id === 'v')!.moves).toEqual(
      uciLine('e4', 'c6', 'd4', 'd5', 'e5'),
    );
  });

  it('weighs each line that picks the lesson by how often games play it', () => {
    // Another lesson's 3.Nc3 makes 3.e5 and 3.exd5 each pick the Caro-Kann.
    const caro = guideLesson(
      'caro',
      'black',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5', 'c4'],
    );
    const other = guideLesson('other', 'black', ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4']);
    const games: Record<string, number[]> = {
      [uciLine('e4', 'c6', 'd4', 'd5', 'e5').at(-1)!]: [10],
      [uciLine('e4', 'c6', 'd4', 'd5', 'exd5').at(-1)!]: [1000],
    };
    const counted = withMoves(caro, keyAfter('e4', 'c6', 'd4', 'd5'), (moves) =>
      moves.map((move) => ({ ...move, games: games[move.uci] })),
    );
    const lesson = inVariation(
      { ...counted, variations: { caro: { name: 'Caro' }, v: { name: 'V', parent: 'caro' } } },
      'v',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'],
      ['e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'],
    );
    // Each is one move from V, but games play 3.exd5 a hundred times as often.
    expect(
      lessonIndex([lesson, other]).caro.variations.find(({ id }) => id === 'v')!.moves,
    ).toEqual(uciLine('e4', 'c6', 'd4', 'd5', 'exd5', 'cxd5'));
  });

  it('weighs moves past a parent line that leaves the book, as games play them', () => {
    const caro = guideLesson(
      'caro',
      'black',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3'],
      ['e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'c3'],
      ['e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'dxc5'],
    );
    const c5 = uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'c5').at(-1);
    const noBookC5 = withMoves(caro, keyAfter('e4', 'c6', 'd4', 'd5', 'e5'), (moves) =>
      moves.map((move) => ({ ...move, book: move.uci !== c5 })),
    );
    const games: Record<string, number[]> = {
      [uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'c3').at(-1)!]: [10],
      [uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'dxc5').at(-1)!]: [1000],
    };
    const counted = withMoves(noBookC5, keyAfter('e4', 'c6', 'd4', 'd5', 'e5', 'c5'), (moves) =>
      moves.map((move) => ({ ...move, games: games[move.uci] })),
    );
    const lesson = inVariation(
      inVariation(
        {
          ...counted,
          variations: {
            caro: { name: 'Caro' },
            adv: { name: 'Adv', parent: 'caro' },
            v: { name: 'V', parent: 'adv' },
          },
        },
        'adv',
        ['e4', 'c6', 'd4', 'd5', 'e5', 'c5'],
      ),
      'v',
      ['e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'c3'],
      ['e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'dxc5'],
    );
    // Only ...c5, no book move, reaches Adv; past it, games play 5.dxc5 far more than 5.c3.
    expect(lessonIndex([lesson]).caro.variations.find(({ id }) => id === 'v')!.moves).toEqual(
      uciLine('e4', 'c6', 'd4', 'd5', 'e5', 'c5', 'dxc5'),
    );
  });

  it('keeps the opening itself at the line that picks it when no position is its own', () => {
    const caro = guideLesson('caro', 'black', ['e4', 'c6', 'd4', 'd5', 'e5']);
    const lesson: Lesson = {
      ...caro,
      variations: { caro: { name: 'Caro' }, a: { name: 'A', parent: 'caro' } },
      positions: Object.fromEntries(
        Object.entries(caro.positions).map(([key, here]) => [key, { ...here, variation: 'a' }]),
      ),
    };
    expect(
      lessonIndex([lesson]).caro.variations.map(({ id, parent, moves }) => [id, parent, moves]),
    ).toEqual([
      ['caro', undefined, uciLine('e4')],
      ['a', 'caro', uciLine('e4')],
    ]);
  });

  it.each(shippedIds)('lists every variation a position of %s is in, as one tree', (id) => {
    const lesson = readShippedLesson(id);
    const used = new Set(Object.values(lesson.positions).map(({ variation }) => variation));
    const { variations } = shippedIndex(id);
    const ids = variations.map((variation) => variation.id);
    expect(ids).toEqual(Object.keys(lesson.variations).filter((variation) => used.has(variation)));
    for (const { id: variation, moves } of variations)
      expect(lesson.positions[lineKeys(moves).at(-1)!].variation).toBe(variation);
    // The opening list roots the lesson at its one variation without a parent.
    expect(variations.filter(({ parent }) => parent === undefined)).toHaveLength(1);
    for (const { parent } of variations) if (parent) expect(ids).toContain(parent);
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
    for (const { moves, lineEnds } of shippedIndex(id).lines) {
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

describe('pickingMoves', () => {
  it('counts the moves played where the openings are picked', () => {
    expect(pickingMoves(INDEX, 'black', uciLine('d4', 'd5', 'c4', 'c6'))).toBe(3);
    expect(pickingMoves(INDEX, 'black', uciLine('e4', 'c6'))).toBe(1);
    expect(pickingMoves(INDEX, 'white', uciLine('d4', 'd5'))).toBe(1);
    expect(pickingMoves(INDEX, 'black', [])).toBe(0);
    // 1...Nf6 leaves every Black lesson: a move of the learner's to judge.
    expect(pickingMoves(INDEX, 'black', uciLine('d4', 'Nf6'))).toBe(1);
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

  it('names two lichess studies by one author by their titles', () => {
    const index = {
      slav: {
        ...INDEX.slav,
        sources: [
          { ...study('Matkun'), title: 'Slav, part 1' },
          { ...study('Matkun'), title: 'Slav, part 2', url: 'https://lichess.org/study/part2' },
          study('Kitsune'),
        ],
      },
    };
    const [slav] = openingsLesson(index, 'black').positions[keyAfter()].moves;
    expect(slav.notes?.[0].text).toBe(
      "Slav Defence, from Slav, part 1 by Matkun, Slav, part 2 by Matkun and Kitsune's lichess study.",
    );
  });

  it("names a study by its title where another lesson credits its author's other study", () => {
    const index = {
      slav: { ...INDEX.slav, sources: [{ ...study('Matkun'), title: 'Slav' }] },
      other: {
        ...INDEX.slav,
        title: 'Other',
        sources: [{ ...study('Matkun'), title: 'Other', url: 'https://lichess.org/study/other' }],
      },
    };
    const [slav] = openingsLesson(index, 'black').positions[keyAfter()].moves;
    expect(slav.notes?.[0].text).toBe('Slav Defence, from Slav by Matkun.');
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
      games: undefined,
      notes: [
        { text: "Caro-Kann Defence, from Kampf's lichess study." },
        ...(own(SAMPLE).notes ?? []),
      ],
    });
    // Without its count, it lists in the index's order, as from any other lesson.
    expect(own(SAMPLE).games).toBeDefined();
    expect(own(lesson).games).toBeUndefined();
    expect(lesson.positions[keyAfter('e4')]).toBe(SAMPLE.positions[keyAfter('e4')]);
    expect(checkLesson(lesson)).toEqual([]);
  });
});

describe('variationLine', () => {
  it('opens a variation at its line, and none for an unknown one', () => {
    const slav = FIXTURE_INDEX.slav;
    expect(variationLine(slav, 'semi-slav')).toBe(
      slav.variations.find(({ id }) => id === 'semi-slav')!.moves,
    );
    expect(variationLine(slav, 'nope')).toBeUndefined();
    expect(variationLine(slav)).toBeUndefined();
  });
});

describe('variationHref', () => {
  it('opens a lesson at a variation, or at its start without one', () => {
    expect(variationHref('caro-kann', 'advance-variation')).toEqual({
      pathname: '/lesson/caro-kann',
      params: { variation: 'advance-variation' },
    });
    expect(variationHref('caro-kann')).toEqual({ pathname: '/lesson/caro-kann', params: {} });
  });
});
