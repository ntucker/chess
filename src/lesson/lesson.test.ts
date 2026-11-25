import { describe, expect, it } from '@jest/globals';

import { noteShows, ratingBandIndex, readLesson } from './lesson';

describe('noteShows', () => {
  it('tells drawn ideas from a badge and from text alone', () => {
    expect(noteShows([{ type: 'evaluation', value: 'equal' }])).toBe('badge');
    expect(
      noteShows([
        { type: 'evaluation', value: 'equal' },
        { type: 'imbalance', side: 'white', kind: 'space' },
      ]),
    ).toBe('drawn');
    expect(noteShows(undefined)).toBe('text');
  });
});

describe('ratingBandIndex', () => {
  const popularity = {
    ratingBands: [1000, 1200, 1400, 1600, 1800],
    speeds: [],
    date: '2026-11-18',
  };

  it.each([
    [1100, 0],
    [1200, 1],
    [1300, 1],
    [1500, 2],
    [1700, 3],
    [1900, 4],
    [800, 0],
  ])('reads rating %i from band %i', (rating, index) => {
    expect(ratingBandIndex(popularity.ratingBands, rating)).toBe(index);
  });
});

describe('readLesson', () => {
  it('refuses a file in another format', () => {
    expect(() => readLesson({ format: 2 })).toThrow('Lesson format 2 is not 4');
    expect(() => readLesson(null)).toThrow('Lesson format undefined is not 4');
  });
});
