import { describe, expect, it } from '@jest/globals';

import { ratingBandIndex, readLesson } from './lesson';

describe('ratingBandIndex', () => {
  const popularity = { ratingBands: [1000, 1200, 1400, 1600, 1800], speeds: [], date: '2026-11-18' };

  it.each([
    [1100, 0],
    [1200, 1],
    [1300, 1],
    [1500, 2],
    [1700, 3],
    [1900, 4],
    [800, 0],
  ])('reads rating %i from band %i', (rating, index) => {
    expect(ratingBandIndex(popularity, rating)).toBe(index);
  });
});

describe('readLesson', () => {
  it('refuses a file in another format', () => {
    expect(() => readLesson({ format: 1 })).toThrow('Lesson format 1 is not 2');
    expect(() => readLesson(null)).toThrow('Lesson format undefined is not 2');
  });
});
