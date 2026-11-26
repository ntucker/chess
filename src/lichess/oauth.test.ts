import { describe, expect, it } from '@jest/globals';

import { redirectSystemPath } from '@/app/+native-intent';

import { isLichessReturn } from './oauth';

const ANSWER = 'io.github.ntucker.openingnight://lichess?code=c&state=s';

describe("lichess's answer on the phone", () => {
  it('is told from other addresses the app opens with', () => {
    expect(isLichessReturn(ANSWER)).toBe(true);
    expect(isLichessReturn('io.github.ntucker.openingnight://lichess')).toBe(true);
    expect(isLichessReturn('io.github.ntucker.openingnight://lichessy')).toBe(false);
    expect(isLichessReturn('io.github.ntucker.openingnight://openings')).toBe(false);
  });

  it('leaves the router where it is while the app runs, and sends it to the return page at a start', () => {
    expect(redirectSystemPath({ path: ANSWER, initial: false })).toBeNull();
    expect(redirectSystemPath({ path: ANSWER, initial: true })).toBe(ANSWER);
    const other = 'io.github.ntucker.openingnight://openings';
    expect(redirectSystemPath({ path: other, initial: false })).toBe(other);
  });
});
