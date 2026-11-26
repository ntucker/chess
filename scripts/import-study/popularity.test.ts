import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkLesson } from '@/lesson/check';
import type { PositionKey } from '@/lesson/lesson';
import { keyAfter as key, SAMPLE } from '@/lesson/lesson.fixture';
import { RATING_BANDS } from '@/lichess/explorer';

import { extractChapter } from './extract';
import { STUDY_PGN } from './fixture';
import { mergeChapters } from './merge';
import { markMistakes } from './mistakes';
import {
  addPopularity,
  type ExplorerAnswer,
  lichessExplorer,
  recount,
  type MoveCounts,
} from './popularity';
import { type Chapter, parseStudy } from './study';

const chapters = parseStudy(STUDY_PGN, () => true);
/** Black's lesson from `chapters`, as the importer has it when popularity runs. */
const lessonOf = (chapters: readonly Chapter[]) =>
  markMistakes(
    mergeChapters(
      {
        id: 'test',
        title: 'Test',
        side: 'black',
        sources: SAMPLE.sources,
      },
      chapters,
      chapters.map((chapter) => extractChapter(chapter, 'black')),
    ),
  ).lesson;
const lesson = lessonOf(chapters);

const AFTER_C6 = key('e4', 'c6'); // White: d4 or Nc3
const AFTER_D5 = key('e4', 'c6', 'd4', 'd5'); // White: e5 or Nc3
const AFTER_E5 = key('e4', 'c6', 'd4', 'd5', 'e5'); // Black: Bf5 or c5
const AFTER_BF5 = key('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'); // White: Nf3 or g4
const AFTER_NF3 = key('e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3'); // Black: e6 or Qb6

describe('addPopularity', () => {
  it("asks about positions with a choice, the opponent's first, and skips bands no game reaches", async () => {
    const asked: [PositionKey, number][] = [];
    // No 1000-rated game plays 4.Nf3 in this fake explorer.
    const counts: Record<PositionKey, MoveCounts> = {
      [AFTER_C6]: { d2d4: 50, b1c3: 5 },
      [AFTER_D5]: { e4e5: 40, b1c3: 30 },
      [AFTER_BF5]: { g1f3: 30, g2g4: 1 },
      [AFTER_E5]: { c8f5: 20, c6c5: 10 },
      [AFTER_NF3]: { e7e6: 9 },
    };
    const explorer = async (at: PositionKey, band: number) => {
      asked.push([at, band]);
      return { counts: band === 1000 && at === AFTER_BF5 ? { g2g4: 1 } : counts[at] };
    };
    const result = await addPopularity(lesson, explorer, () => '2026-11-19');

    expect([...new Set(asked.map(([at]) => at))]).toEqual([
      AFTER_C6,
      AFTER_D5,
      AFTER_BF5,
      AFTER_E5,
      AFTER_NF3,
    ]);
    expect(asked.filter(([at]) => at === AFTER_NF3).map(([, band]) => band)).toEqual(
      RATING_BANDS.slice(1),
    );
    expect(result.popularity).toEqual({
      ratingBands: RATING_BANDS,
      speeds: ['blitz', 'rapid', 'classical'],
      date: '2026-11-19',
    });
    expect(result.positions[AFTER_NF3].moves.map((move) => [move.uci, move.games])).toEqual([
      ['e7e6', [0, 9, 9, 9, 9]],
      ['d8b6', [0, 0, 0, 0, 0]],
    ]);
    // A position without a choice is not measured.
    expect(result.positions[key('e4')].moves[0].games).toBeUndefined();
    expect(checkLesson(result)).toEqual(checkLesson(lesson));
  });

  it("keeps counts where it doesn't ask, and writes the games reaching each position it asks about", async () => {
    // Counts a find's path left on a position without a choice, and on one popularity asks about.
    const measured = {
      ...lesson,
      positions: {
        ...lesson.positions,
        [key('e4')]: {
          ...lesson.positions[key('e4')],
          moves: [{ ...lesson.positions[key('e4')].moves[0], games: [1, 2, 3, 4, 5] }],
          games: [2, 3, 4, 5, 6],
        },
        [AFTER_D5]: { ...lesson.positions[AFTER_D5], games: [9, 9, 9, 9, 9] },
      },
    };
    const explorer = async (at: PositionKey): Promise<ExplorerAnswer> =>
      at === AFTER_D5
        ? { counts: { e4e5: 40, b1c3: 30 } }
        : { counts: { d2d4: 50, b1c3: 5, c8f5: 20, c6c5: 10, g1f3: 30, e7e6: 9 }, total: 100 };
    const result = await addPopularity(measured, explorer, () => '2026-11-25');

    expect(result.positions[key('e4')]).toEqual(measured.positions[key('e4')]);
    expect(result.positions[AFTER_C6].games).toEqual([100, 100, 100, 100, 100]);
    // Its answer predates totals: the games reaching it are unknown, not the old ones.
    expect(result.positions[AFTER_D5].games).toBeUndefined();
    expect(checkLesson(result)).toEqual(checkLesson(lesson));
  });

  it('asks about a position one move order reaches, though another counted 0 games', async () => {
    // Both chapters reach 3.Nc3 dxe4 4.Nxe4, where Black chooses; no game in the fake explorer plays 2.Nc3.
    const transposing = parseStudy(
      `[Event "🔵 01 Classical"]\n\n1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 (4... Nf6) *\n\n` +
        `[Event "🔵 02 Two Knights"]\n\n1. e4 c6 2. Nc3 d5 3. d4 *\n`,
      () => true,
    );
    const small = lessonOf(transposing);
    const asked: PositionKey[] = [];
    const explorer = async (at: PositionKey): Promise<ExplorerAnswer> => {
      asked.push(at);
      return { counts: at === AFTER_C6 ? { d2d4: 10 } : { c8f5: 5, g8f6: 5 } };
    };
    await addPopularity(small, explorer, () => '2026-11-19');

    expect(
      asked.filter((at) => at === key('e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4')),
    ).toHaveLength(RATING_BANDS.length);
  });
});

describe('recount', () => {
  it('measures only the positions asked, from one answer per band with its total', async () => {
    const asked: string[] = [];
    const counted = await recount(lesson, [AFTER_E5], async (key, band, options) => {
      asked.push(`${band} ${options?.total}`);
      return { counts: { [lesson.positions[key].moves[0].uci]: band }, total: band * 2 };
    });
    expect(asked).toEqual(RATING_BANDS.map((band) => `${band} true`));
    expect(counted.positions[AFTER_E5].games).toEqual(RATING_BANDS.map((band) => band * 2));
    expect(counted.positions[AFTER_E5].moves[0].games).toEqual(RATING_BANDS);
    expect(counted.positions[AFTER_C6]).toBe(lesson.positions[AFTER_C6]);
  });
});

describe('lichessExplorer', () => {
  const answer = (status: number, body: unknown = {}) =>
    new Response(JSON.stringify(body), { status });

  it('waits a minute after a 429, sends the token, and answers from its cache after', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'explorer-')), 'explorer.jsonl');
    const replies = [
      answer(429),
      answer(200, { moves: [{ uci: 'e2e4', white: 5, draws: 1, black: 4 }] }),
    ];
    const requests: [URL, RequestInit | undefined][] = [];
    const waits: number[] = [];
    const fetch = (async (url: URL, init?: RequestInit) => {
      requests.push([url, init]);
      return replies.shift()!;
    }) as typeof globalThis.fetch;
    const sleep = async (ms: number) => void waits.push(ms);

    const explorer = lichessExplorer({
      token: 'secret',
      cacheFile,
      today: '2026-11-21',
      fetch,
      sleep,
    });
    expect((await explorer.ask(key(), 1400)).counts).toEqual({ e2e4: 10 });
    expect(explorer.answeredOn()).toBe('2026-11-21');
    const [wait, ...more] = waits.filter((ms) => ms > 0);
    expect(wait).toBeGreaterThan(59_000);
    expect(more).toEqual([]);
    expect(requests[0][0].searchParams.get('ratings')).toBe('1400');
    expect(requests[0][1]?.headers).toEqual({ Authorization: 'Bearer secret' });

    const resumed = lichessExplorer({ cacheFile, today: '2026-12-01', fetch, sleep });
    // Before any answer, the counts would be today's.
    expect(resumed.answeredOn()).toBe('2026-12-01');
    expect((await resumed.ask(key(), 1400)).counts).toEqual({ e2e4: 10 });
    expect(requests).toHaveLength(2);
    // The answer keeps the date lichess gave it, not the rerun's.
    expect(resumed.answeredOn()).toBe('2026-11-21');
  });

  it('asks again for a cached answer without the total when asked for one', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'explorer-')), 'explorer.jsonl');
    writeFileSync(cacheFile, `${JSON.stringify([`1400 ${key()}`, { e2e4: 10 }, '2026-11-20'])}\n`);
    let requests = 0;
    const fetch = (async () => {
      requests++;
      return answer(200, {
        white: 6,
        draws: 1,
        black: 5,
        moves: [{ uci: 'e2e4', white: 5, draws: 1, black: 5 }],
      });
    }) as typeof globalThis.fetch;
    const open = () =>
      lichessExplorer({ cacheFile, today: '2026-11-25', fetch, sleep: async () => {} });

    expect(await open().ask(key(), 1400)).toEqual({ counts: { e2e4: 10 } });
    expect(requests).toBe(0);
    const explorer = open();
    expect(await explorer.ask(key(), 1400, { total: true })).toEqual({
      counts: { e2e4: 11 },
      total: 12,
    });
    expect(explorer.answeredOn()).toBe('2026-11-25');
    // The new answer replaces the old one, also for a rerun.
    expect(await open().ask(key(), 1400, { total: true })).toEqual({
      counts: { e2e4: 11 },
      total: 12,
    });
    expect(requests).toBe(1);
  });

  it('dates the counts by the latest answer asked for', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'explorer-')), 'explorer.jsonl');
    writeFileSync(
      cacheFile,
      [
        [`1400 ${key()}`, { e2e4: 10 }, '2026-11-21'],
        [`1600 ${key()}`, { e2e4: 20 }, '2026-11-19'],
      ]
        .map((row) => `${JSON.stringify(row)}\n`)
        .join(''),
    );
    const explorer = lichessExplorer({ cacheFile, today: '2026-12-01', sleep: async () => {} });
    await explorer.ask(key(), 1600);
    expect(explorer.answeredOn()).toBe('2026-11-19');
    await explorer.ask(key(), 1400);
    await explorer.ask(key(), 1600);
    expect(explorer.answeredOn()).toBe('2026-11-21');
  });

  it('asks again about everything when fresh, and replaces the file once saved', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'explorer-')), 'explorer.jsonl');
    writeFileSync(cacheFile, `${JSON.stringify([`1400 ${key()}`, { e2e4: 10 }, '2026-11-20'])}\n`);
    const fetch = (async () =>
      answer(200, {
        moves: [{ uci: 'e2e4', white: 30, draws: 0, black: 0 }],
      })) as typeof globalThis.fetch;
    const open = (fresh: boolean) =>
      lichessExplorer({ cacheFile, fresh, today: '2026-12-01', fetch, sleep: async () => {} });
    const recount = open(true);
    expect((await recount.ask(key(), 1400)).counts).toEqual({ e2e4: 30 });
    recount.saveUsed();
    const after = open(false);
    expect((await after.ask(key(), 1400)).counts).toEqual({ e2e4: 30 });
    expect(after.answeredOn()).toBe('2026-12-01');
  });

  it('asks again for an answer whose cache line a stopped crawl cut short, and resumes after', async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'explorer-')), 'explorer.jsonl');
    writeFileSync(
      cacheFile,
      `${JSON.stringify([`1400 ${key()}`, { e2e4: 10 }, '2026-11-20'])}\n["1600 ${key()}",{"e2`,
    );
    let requests = 0;
    const fetch = (async () => {
      requests++;
      return answer(200, { moves: [{ uci: 'e2e4', white: 20, draws: 0, black: 0 }] });
    }) as typeof globalThis.fetch;
    const openExplorer = () => lichessExplorer({ cacheFile, fetch, sleep: async () => {} });
    const explorer = openExplorer();
    expect((await explorer.ask(key(), 1400)).counts).toEqual({ e2e4: 10 });
    expect((await explorer.ask(key(), 1600)).counts).toEqual({ e2e4: 20 });
    const resumed = openExplorer();
    expect((await resumed.ask(key(), 1400)).counts).toEqual({ e2e4: 10 });
    expect((await resumed.ask(key(), 1600)).counts).toEqual({ e2e4: 20 });
    expect(requests).toBe(1);
  });

  it("answers castling as the king's two-square move (e1g1), also from its cache", async () => {
    const cacheFile = join(mkdtempSync(join(tmpdir(), 'explorer-')), 'explorer.jsonl');
    let requests = 0;
    const fetch = (async () => {
      requests++;
      return answer(200, { moves: [{ uci: 'e1h1', white: 3, draws: 0, black: 2 }] });
    }) as typeof globalThis.fetch;
    const openExplorer = () => lichessExplorer({ cacheFile, fetch, sleep: async () => {} });
    const castles = key('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
    expect((await openExplorer().ask(castles, 1400)).counts).toEqual({ e1g1: 5 });
    expect((await openExplorer().ask(castles, 1400)).counts).toEqual({ e1g1: 5 });
    expect(requests).toBe(1);
  });
});
