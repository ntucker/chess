import { describe, expect, it } from '@jest/globals';

import type { Lesson } from '@/lesson/lesson';
import { keyAfter, uci } from '@/lesson/lesson.fixture';

import { withoutEmptyVariations } from './emptyVariations';
import { at, testLesson } from './fixture';

/**
 * Black's lesson: 1.e4 c6 (book, in 'test'), then 2.d4 d5 named 'empty' with
 * no book move or note, and 2.Nc3 named 'two-knights' with a note.
 */
function lesson(): Lesson {
  const base = testLesson({
    [keyAfter()]: at([{ uci: uci('e4') }]),
    [keyAfter('e4')]: at([{ uci: uci('e4', 'c6'), book: true }]),
    [keyAfter('e4', 'c6')]: at([{ uci: uci('e4', 'c6', 'd4') }, { uci: uci('e4', 'c6', 'Nc3') }]),
    [keyAfter('e4', 'c6', 'd4')]: {
      ...at([{ uci: uci('e4', 'c6', 'd4', 'd5') }]),
      variation: 'empty',
    },
    [keyAfter('e4', 'c6', 'd4', 'd5')]: { ...at([]), variation: 'empty' },
    [keyAfter('e4', 'c6', 'Nc3')]: {
      ...at([], [{ text: 'White keeps d2-d4 in reserve.' }]),
      variation: 'two-knights',
    },
  });
  return {
    ...base,
    variations: {
      ...base.variations,
      empty: { name: 'Empty', parent: 'test' },
      'two-knights': { name: 'Two Knights', parent: 'test' },
      unnamed: { name: 'Names nothing', parent: 'test' },
    },
  };
}

describe('withoutEmptyVariations', () => {
  it("drops variations that teach nothing, their positions taking the name they're reached from", () => {
    const { lesson: taught, dropped } = withoutEmptyVariations(lesson());
    expect(dropped).toEqual(['empty', 'unnamed']);
    expect(Object.keys(taught.variations)).toEqual(['test', 'two-knights']);
    expect(taught.positions[keyAfter('e4', 'c6', 'd4')].variation).toBe('test');
    expect(taught.positions[keyAfter('e4', 'c6', 'd4', 'd5')].variation).toBe('test');
    expect(taught.positions[keyAfter('e4', 'c6', 'Nc3')].variation).toBe('two-knights');
  });

  it('names a position the start never reaches by the opening, never a dropped variation', () => {
    const island = keyAfter('a3');
    const base = lesson();
    // A lesson id other than the opening's variation, which has no parent.
    const input = {
      ...base,
      id: 'other',
      positions: { ...base.positions, [island]: { ...at([]), variation: 'empty' } },
    };
    expect(withoutEmptyVariations(input).lesson.positions[island].variation).toBe('test');
  });

  it('returns a lesson whose variations all teach as it is', () => {
    const input = testLesson({
      [keyAfter()]: at([{ uci: uci('e4') }]),
      [keyAfter('e4')]: at([{ uci: uci('e4', 'c6'), book: true }]),
    });
    expect(withoutEmptyVariations(input).lesson).toBe(input);
  });
});
