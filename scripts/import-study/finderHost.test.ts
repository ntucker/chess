import { describe, expect, it } from '@jest/globals';

import type { Answers, Request } from '@/opportunity/walk';

import { type FinderHost, settle } from './finderHost';

/** A host whose answers are the positions it was asked about, and which records each round of requests. */
function fakeHost() {
  const known = new Set<string>();
  const rounds: string[][] = [];
  const host: FinderHost = {
    answers: {} as Answers,
    answer: async (requests) => {
      rounds.push(requests.map(({ spot }) => spot.key));
      requests.forEach(({ spot }) => known.add(spot.key));
    },
    stop: () => {},
  };
  return { host, known, rounds };
}

const request = (key: string): Request => ({ kind: 'full', spot: { line: [], key } });

describe('settle', () => {
  it('asks round by round until the value needs no more answers', async () => {
    const { host, known, rounds } = fakeHost();
    const value = await settle(host, (ask) => {
      // b is asked only once a is known, as the finder asks deeper positions in later rounds.
      const missing = ['a', ...(known.has('a') ? ['b'] : [])].filter((key) => !known.has(key));
      missing.forEach((key) => ask(request(key)));
      return missing.length ? undefined : 'done';
    });
    expect(value).toBe('done');
    expect(rounds).toEqual([['a'], ['b']]);
  });

  it('throws when the value waits on an answer it never asked for', async () => {
    const { host } = fakeHost();
    await expect(settle(host, () => undefined)).rejects.toThrow('never asked for');
  });
});
