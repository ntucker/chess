import { describe, expect, it } from '@jest/globals';

import { lineKeys } from '@/lesson/select';

import { pacedExplorer, recordedCounts, REQUEST_INTERVAL_MS } from './explorer';

const [START] = lineKeys([]);
/** After 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6, where White may castle. */
const CASTLES = lineKeys(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6']).at(-1)!;

const answer = (status: number, body: object = {}) =>
  ({ status, ok: status < 400, json: async () => body }) as Response;

const BODY = {
  white: 10,
  draws: 5,
  black: 5,
  moves: [{ uci: 'e2e4', white: 6, draws: 2, black: 2 }],
};

describe('pacedExplorer', () => {
  it("counts each move's games and the position's, sending the token", async () => {
    const asked: RequestInit[] = [];
    const ask = pacedExplorer({
      fetch: async (_url, init) => {
        asked.push(init!);
        return answer(200, BODY);
      },
      sleep: async () => {},
    });
    expect(await ask(START, 1400, 'lip_token')).toEqual({ counts: { e2e4: 10 }, total: 20 });
    expect(asked[0].headers).toEqual({ Authorization: 'Bearer lip_token' });
  });

  it('sends one request at a time at its pace, however many ask at once', async () => {
    const waits: number[] = [];
    const ask = pacedExplorer({
      fetch: async () => answer(200, BODY),
      sleep: async (ms) => void waits.push(ms),
    });
    await Promise.all([ask(START, 1400), ask(START, 1600), ask(START, 1800)]);
    // The first goes at once; each later one waits its turn after the one before.
    expect(waits[0]).toBeLessThanOrEqual(0);
    expect(waits[1]).toBeGreaterThan(REQUEST_INTERVAL_MS - 100);
    expect(waits[2]).toBeGreaterThan(2 * REQUEST_INTERVAL_MS - 100);
  });

  it('waits a minute after a 429, every caller, and asks again; fails on any other refusal', async () => {
    const statuses = [429, 200, 200];
    const waits: number[] = [];
    const ask = pacedExplorer({
      fetch: async () => answer(statuses.shift()!, BODY),
      sleep: async (ms) => void waits.push(ms),
    });
    expect((await ask(START, 1400)).total).toBe(20);
    expect(waits).toContain(60_000);
    // A request asked for after the 429 waits out the minute too.
    waits.length = 0;
    await ask(START, 1600);
    expect(waits[0]).toBeGreaterThan(55_000);

    const refusing = pacedExplorer({ fetch: async () => answer(401), sleep: async () => {} });
    await expect(refusing(START, 1400)).rejects.toThrow('Explorer answered 401');
  });
});

describe('recordedCounts', () => {
  it("writes lichess's castling (the king taking its rook) as lesson files do", () => {
    expect(recordedCounts(CASTLES, { e1h1: 7, d2d3: 3 })).toEqual({ e1g1: 7, d2d3: 3 });
  });
});
