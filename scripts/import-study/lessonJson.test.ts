import { describe, expect, it } from '@jest/globals';

import { SAMPLE } from '@/lesson/lesson.fixture';

import { lessonJson } from './lessonJson';

describe('lessonJson', () => {
  it('writes the lesson back as it was, one position per line', () => {
    const json = lessonJson(SAMPLE);
    expect(JSON.parse(json)).toEqual(SAMPLE);
    expect(json.split('\n')).toHaveLength(Object.keys(SAMPLE.positions).length + 3);
  });
});
