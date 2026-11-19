import { describe, expect, it } from '@jest/globals';

import { SAMPLE } from '@/lesson/lesson.fixture';

import { reviewItems, reviewKind } from './review';

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

describe('reviewKind', () => {
  it('tells drawn ideas from a badge and from text alone', () => {
    expect(reviewKind([{ type: 'evaluation', value: 'equal' }])).toBe('badge');
    expect(reviewKind([{ type: 'evaluation', value: 'equal' }, { type: 'imbalance', side: 'white', kind: 'space' }])).toBe(
      'drawn',
    );
    expect(reviewKind(undefined)).toBe('text');
  });
});
