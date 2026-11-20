import { describe, expect, it } from '@jest/globals';

import { readShippedLesson } from '@/lesson/lesson.fixture';
import { lineKeys } from '@/lesson/select';

import { parseProgress, positionHash, type SavedProgress, withMark } from './progress';

const START = lineKeys([])[0];
const AFTER_E4 = lineKeys(['e2e4'])[1];

describe('withMark', () => {
  it('adds each mark once, per lesson, keeping what was saved when nothing is new', () => {
    const none: SavedProgress = {};
    const once = withMark(
      withMark(none, 'caro-kann', 'seen', START),
      'caro-kann',
      'passed',
      AFTER_E4,
    );
    expect(once).toEqual({
      'caro-kann': { seen: [positionHash(START)], passed: [positionHash(AFTER_E4)] },
    });
    expect(withMark(once, 'caro-kann', 'seen', START)).toBe(once);
    expect(withMark(once, 'slav', 'seen', START)).toEqual({
      ...once,
      slav: { seen: [positionHash(START)], passed: [] },
    });
  });
});

describe('positionHash', () => {
  it('gives every position of the shipped lesson its own short hash', () => {
    const lesson = readShippedLesson('caro-kann');
    const keys = Object.keys(lesson.positions);
    const hashes = new Set(keys.map(positionHash));
    expect(hashes.size).toBe(keys.length);
    expect(Math.max(...[...hashes].map((hash) => hash.length))).toBeLessThanOrEqual(11);
  });
});

describe('parseProgress', () => {
  it('reads what was saved, dropping only what is damaged', () => {
    const saved = withMark(
      withMark({}, 'caro-kann', 'seen', START),
      'caro-kann',
      'passed',
      AFTER_E4,
    );
    expect(parseProgress(JSON.stringify(saved))).toEqual(saved);
    expect(parseProgress(JSON.stringify({ a: { seen: ['x', 3] }, b: 'oops', c: [1] }))).toEqual({
      a: { seen: ['x'], passed: [] },
    });
    expect(parseProgress('not json')).toEqual({});
    expect(parseProgress('null')).toEqual({});
  });
});
