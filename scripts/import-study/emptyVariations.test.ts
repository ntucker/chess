import { describe, expect, it } from '@jest/globals';

import type { Lesson } from '@/lesson/lesson';
import { keyAfter, uci } from '@/lesson/lesson.fixture';

import { withoutEmptyVariations } from './emptyVariations';
import { at, testLesson } from './fixture';

/**
 * Black's lesson: 1.e4 c6 (book, in 'test'), then 2.d4 in 'unbooked' with no
 * book move or note, under 'group', which names no position of its own.
 */
function lesson(): Lesson {
  const base = testLesson({
    [keyAfter()]: at([{ uci: uci('e4') }]),
    [keyAfter('e4')]: at([{ uci: uci('e4', 'c6'), book: true }]),
    [keyAfter('e4', 'c6')]: at([{ uci: uci('e4', 'c6', 'd4') }]),
    [keyAfter('e4', 'c6', 'd4')]: { ...at([]), variation: 'unbooked' },
  });
  return {
    ...base,
    variations: {
      ...base.variations,
      group: { name: 'Group', parent: 'test' },
      unbooked: { name: 'Group: Unbooked', parent: 'group' },
      leftover: { name: 'Leftover', parent: 'test' },
    },
  };
}

describe('withoutEmptyVariations', () => {
  it('drops only the names no position is in or under', () => {
    const input = lesson();
    const { lesson: named, dropped } = withoutEmptyVariations(input);
    expect(dropped).toEqual(['leftover']);
    expect(Object.keys(named.variations)).toEqual(['test', 'group', 'unbooked']);
    expect(named.positions).toBe(input.positions);
  });

  it('returns a lesson whose variations all name positions as it is', () => {
    const { leftover: _, ...variations } = lesson().variations;
    const input = { ...lesson(), variations };
    expect(withoutEmptyVariations(input).lesson).toBe(input);
  });
});
