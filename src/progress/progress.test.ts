import { describe, expect, it } from '@jest/globals';

import { readShippedLesson } from '@/lesson/lesson.fixture';
import { lineKeys } from '@/lesson/select';

import {
  NO_PROGRESS,
  parseProgress,
  positionHash,
  type Progress,
  type ProgressAction,
  progressReducer,
} from './progress';

const START = lineKeys([])[0];
const AFTER_E4 = lineKeys(['e2e4'])[1];
const marked = (mark: 'seen' | 'passed', key = START, lesson = 'caro-kann'): ProgressAction => ({
  type: 'marked',
  lesson,
  mark,
  key,
});
const run = (state: Progress, ...actions: ProgressAction[]) =>
  actions.reduce(progressReducer, state);

describe('progressReducer', () => {
  it('adds each mark once, per lesson, keeping the state when nothing is new', () => {
    const once = run(NO_PROGRESS, marked('seen'), marked('passed', AFTER_E4));
    expect(once).toEqual({
      'caro-kann': { seen: [positionHash(START)], passed: [positionHash(AFTER_E4)] },
    });
    expect(run(once, marked('seen'))).toBe(once);
    expect(run(once, marked('seen', START, 'slav'))).toEqual({
      ...once,
      slav: { seen: [positionHash(START)], passed: [] },
    });
  });

  it('keeps marks earned before the remembered progress loads', () => {
    const early = run(NO_PROGRESS, marked('seen'));
    const remembered = run(NO_PROGRESS, marked('seen'), marked('seen', AFTER_E4));
    expect(run(early, { type: 'loaded', progress: remembered })).toEqual(remembered);
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
    const saved = run(NO_PROGRESS, marked('seen'), marked('passed', AFTER_E4));
    expect(parseProgress(JSON.stringify(saved))).toEqual(saved);
    expect(parseProgress(JSON.stringify({ a: { seen: ['x', 3] }, b: 'oops', c: [1] }))).toEqual({
      a: { seen: ['x'], passed: [] },
    });
    expect(parseProgress('not json')).toBe(NO_PROGRESS);
    expect(parseProgress('null')).toBe(NO_PROGRESS);
  });
});
