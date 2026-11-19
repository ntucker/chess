import { describe, expect, it } from '@jest/globals';

import { checkLesson } from './check';
import { keyAfter, SAMPLE, uciLine } from './lesson.fixture';
import { indexEntry, lessonOf, lessonsFrom, openingsLesson, withOpenings } from './openings';
import { candidates } from './select';

const source = (author: string) => ({ title: 'A study', author, url: '' });
const INDEX = {
  'caro-kann': {
    title: 'Caro-Kann Defence',
    side: 'black',
    source: source('Kampf'),
    firstMoves: ['e2e4'],
  },
  slav: { title: 'Slav Defence', side: 'black', source: source('Matkun'), firstMoves: ['d2d4'] },
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
  it("names the lesson's title, side, source and first moves", () => {
    expect(indexEntry(SAMPLE)).toEqual({
      title: SAMPLE.title,
      side: 'black',
      source: SAMPLE.source,
      firstMoves: ['e2e4'],
    });
  });
});
