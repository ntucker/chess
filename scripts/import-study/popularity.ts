/**
 * How often lichess players make each guide move, per rating band, from the
 * lichess opening explorer (https://explorer.lichess.ovh). The explorer
 * refuses requests without a lichess token, and lichess asks for one request
 * at a time and a full minute's pause after a 429.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { parsePosition, parsePositionKey, positionKey, recordedMove } from '@/game/replay';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';

import { played } from './study';

/** The explorer's bands the app reads (see `ratingBandIndex`), each counting ratings up to the next. */
export const RATING_BANDS = [1000, 1200, 1400, 1600, 1800];
/** Bullet games are left out: they are played too fast to say what players choose. */
const SPEEDS = ['blitz', 'rapid', 'classical'];

/** Games per move in one position and band; a move missing from it was not played. */
export type MoveCounts = Readonly<Record<Uci, number>>;
/** Games per move as lichess writes moves (castling as the king taking its rook, `e1h1`). */
type LichessCounts = Readonly<Record<string, number>>;
export type Explorer = (key: PositionKey, band: number) => Promise<MoveCounts>;

interface ExplorerOptions {
  readonly token?: string;
  /** Where answers are kept, one per line, so a stopped crawl resumes where it left off. */
  readonly cacheFile: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** The most moves the explorer lists for a position: more than any guide position has. */
const MAX_MOVES = 100;
const RETRY_AFTER_MS = 60_000;
const ALL_BANDS: readonly boolean[] = RATING_BANDS.map(() => true);
const NO_BANDS: readonly boolean[] = RATING_BANDS.map(() => false);
/** Measured: one request every 2.5 s draws no 429s (about 24 a minute); faster ones do. */
const REQUEST_INTERVAL_MS = 2_500;

/**
 * The lichess explorer, answering from `cacheFile` first. The cache keeps
 * lichess's own UCI (castling as the king taking its rook, `e1h1`); answers
 * use the lesson's (`e1g1`).
 */
export function lichessExplorer({
  token,
  cacheFile,
  fetch: get = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ExplorerOptions): Explorer {
  mkdirSync(dirname(cacheFile), { recursive: true });
  const { answers: cache, cut } = readCache(cacheFile);
  // The first answer starts a new line after a cut one.
  let separator = cut ? '\n' : '';
  let lastRequest = -Infinity;
  const paced = async (url: URL) => {
    await sleep(Math.max(0, lastRequest + REQUEST_INTERVAL_MS - Date.now()));
    lastRequest = Date.now();
    return get(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  const answer = async (key: PositionKey, band: number): Promise<LichessCounts> => {
    const id = `${band} ${key}`;
    const cached = cache.get(id);
    if (cached) return cached;
    const url = new URL('https://explorer.lichess.ovh/lichess');
    url.search = new URLSearchParams({
      fen: `${key} 0 1`,
      ratings: String(band),
      speeds: SPEEDS.join(','),
      moves: String(MAX_MOVES),
      topGames: '0',
      recentGames: '0',
    }).toString();
    for (;;) {
      const response = await paced(url);
      if (response.status === 429) {
        await sleep(RETRY_AFTER_MS);
        continue;
      }
      if (!response.ok) throw new Error(`Explorer answered ${response.status} for ${id}`);
      const body = (await response.json()) as { moves: { uci: string; white: number; draws: number; black: number }[] };
      const counts = Object.fromEntries(body.moves.map((move) => [move.uci, move.white + move.draws + move.black]));
      cache.set(id, counts);
      appendFileSync(cacheFile, `${separator}${JSON.stringify([id, counts])}\n`);
      separator = '';
      return counts;
    }
  };
  return async (key, band) => recordedCounts(key, await answer(key, band));
}

/**
 * `counts` with each move as lesson files write it (`recordedMove`). A move
 * `recordedMove` rejects keeps lichess's key, which no lesson move asks for.
 */
function recordedCounts(key: PositionKey, counts: LichessCounts): MoveCounts {
  const pos = parsePositionKey(key)!;
  return Object.fromEntries(Object.entries(counts).map(([uci, games]) => [recordedMove(pos, uci) ?? uci, games]));
}

/**
 * The cached answers, and whether the file ends in a line a stopped crawl cut
 * short. Only the last line can be: it is dropped, so its question is asked again.
 */
function readCache(file: string): { answers: Map<string, LichessCounts>; cut: boolean } {
  if (!existsSync(file)) return { answers: new Map(), cut: false };
  const lines = readFileSync(file, 'utf8').split('\n');
  // A whole file ends in a newline, so the last piece is empty; otherwise it is the cut line.
  const last = lines.pop();
  return {
    answers: new Map(lines.filter(Boolean).map((line) => JSON.parse(line) as [string, LichessCounts])),
    cut: !!last,
  };
}

/**
 * `lesson` with games per band for the moves of each position where the side
 * to move has a choice: the opponent's first, nearest the start first, then
 * the learner's. Moves without a choice get no counts ("not measured"), and
 * counts already in `lesson` are replaced.
 *
 * A band is not asked about where no game can reach the position, because
 * every move into it counted 0 games there, or left a position no game
 * reaches: its moves count 0 there. (A transposition from outside the guide
 * could in theory reach it, and a move into it from a position later in the
 * crawl is not seen in time.)
 */
export async function addPopularity(
  lesson: Lesson,
  explorer: Explorer,
  date: string,
  onProgress?: (asked: number) => void,
): Promise<Lesson> {
  const start = positionKey(parsePosition(lesson.start)!);
  const order = byDistance(lesson, start);
  const counts = new Map<PositionKey, readonly number[][]>();
  let asked = 0;
  const crawl = async (wanted: (key: PositionKey) => boolean) => {
    /** Per band, whether some game can reach each position, as far as the counts so far tell. */
    const reached = new Map([[start, ALL_BANDS]]);
    for (const [key, next] of order) {
      const moves = lesson.positions[key].moves;
      // The position that first led here comes earlier in `order`, so this one has an entry.
      const here = reached.get(key)!;
      if (wanted(key) && !counts.has(key)) {
        const answers: (MoveCounts | undefined)[] = [];
        for (const [i, band] of RATING_BANDS.entries()) answers.push(here[i] ? await explorer(key, band) : undefined);
        counts.set(
          key,
          moves.map((move) => answers.map((answer) => answer?.[move.uci] ?? 0)),
        );
        onProgress?.(++asked);
      }
      const games = counts.get(key);
      // next[m] is the position moves[m] leads to.
      next.forEach((after, m) => {
        // Unmeasured moves (no counts) are assumed played.
        const recorded = reached.get(after) ?? NO_BANDS;
        reached.set(
          after,
          recorded.map((was, i) => was || (here[i] && games?.[m][i] !== 0)),
        );
      });
    }
  };
  const choice = (key: PositionKey) => lesson.positions[key].moves.length > 1;
  const learnerToMove = (key: PositionKey) => parsePositionKey(key)!.turn === lesson.side;
  await crawl((key) => choice(key) && !learnerToMove(key));
  await crawl((key) => choice(key) && learnerToMove(key));
  return {
    ...lesson,
    popularity: { ratingBands: RATING_BANDS, speeds: SPEEDS, date },
    positions: Object.fromEntries(
      Object.entries(lesson.positions).map(([key, entry]) => {
        const games = counts.get(key);
        // Counts already in the file are replaced, or dropped where nothing was asked.
        const moves = entry.moves.map(({ games: _, ...move }, m) => (games ? { ...move, games: games[m] } : move));
        return [key, { ...entry, moves }];
      }),
    ),
  };
}

/** The guide's positions, nearest `start` first, each with the positions its moves lead to. */
function byDistance(lesson: Lesson, start: PositionKey): Map<PositionKey, PositionKey[]> {
  const order = new Map<PositionKey, PositionKey[]>([[start, []]]);
  // A Map's iteration visits the entries added during it, in order.
  for (const [key, next] of order) {
    const pos = parsePositionKey(key)!;
    for (const move of lesson.positions[key].moves) {
      const after = positionKey(played(pos, move.uci));
      next.push(after);
      if (after in lesson.positions && !order.has(after)) order.set(after, []);
    }
  }
  return order;
}
