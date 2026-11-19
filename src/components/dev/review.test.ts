import { describe, expect, it } from '@jest/globals';

import { SAMPLE } from '@/lesson/lesson.fixture';

import { reviewItems } from './review';

describe('reviewItems', () => {
  const items = reviewItems(SAMPLE);

  it('lists every note of the lesson once', () => {
    const notes = Object.values(SAMPLE.positions).flatMap((entry) => [
      ...(entry.notes ?? []),
      ...entry.moves.flatMap((move) => move.notes ?? []),
    ]);
    expect(items).toHaveLength(notes.length);
    expect(new Set(items.map((item) => item.key)).size).toBe(items.length);
  });

  it('gives a move note the line through its move, and draws it in the position after', () => {
    const c6 = items.find((item) => item.line === '1.e4 c6' && item.move === 'c7c6')!;
    expect(c6.position.turn).toBe('white');
    expect(c6.variation).toBeTruthy();
  });
});
