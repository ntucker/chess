/**
 * How often lichess players make each guide move, per rating band, from the
 * lichess opening explorer (https://explorer.lichess.ovh). The explorer
 * refuses requests without a lichess token, and lichess asks for one request
 * at a time and a full minute's pause after a 429.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

import { parsePosition, parsePositionKey, positionKey } from '@/game/replay';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';

import { played } from './study';

/** The explorer's bands the app reads (see `ratingBandIndex`), each counting ratings up to the next. */
export const RATING_BANDS = [1000, 1200, 1400, 1600, 1800];
/** Bullet games are left out: they are played too fast to say what players choose. */
const SPEEDS = ['blitz', 'rapid', 'classical'];

/** Games per move in one position and band; a move missing from it was not played. */
export type MoveCounts = Readonly<Record<Uci, number>>;
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

/** The lichess explorer, answering from `cacheFile` first. */
export function lichessExplorer({
  token,
  cacheFile,
  fetch: get = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ExplorerOptions): Explorer {
  const cache = readCache(cacheFile);
  let lastRequest = -Infinity;
  const paced = async (url: URL) => {
    await sleep(Math.max(0, lastRequest + REQUEST_INTERVAL_MS - Date.now()));
    lastRequest = Date.now();
    return get(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  return async (key, band) => {
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
      const body = (await response.json()) as { moves: { uci: Uci; white: number; draws: number; black: number }[] };
      const counts = Object.fromEntries(body.moves.map((move) => [move.uci, move.white + move.draws + move.black]));
      cache.set(id, counts);
      appendFileSync(cacheFile, `${JSON.stringify([id, counts])}\n`);
      return counts;
    }
  };
}

function readCache(file: string): Map<string, MoveCounts> {
  if (!existsSync(file)) return new Map();
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  return new Map(lines.map((line) => JSON.parse(line) as [string, MoveCounts]));
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
  const order = byDistance(lesson);
  const counts = new Map<PositionKey, readonly number[][]>();
  let asked = 0;
  const crawl = async (wanted: (key: PositionKey) => boolean) => {
    /** Per band, whether some game can reach each position, as far as the counts so far tell. */
    const reached = new Map([[order[0], ALL_BANDS]]);
    for (const key of order) {
      const pos = parsePositionKey(key)!;
      const moves = lesson.positions[key].moves;
      const reach = reached.get(key) ?? ALL_BANDS;
      if (wanted(key) && !counts.has(key)) {
        const answers: (MoveCounts | undefined)[] = [];
        for (const [i, band] of RATING_BANDS.entries()) answers.push(reach[i] ? await explorer(key, band) : undefined);
        counts.set(
          key,
          moves.map((move) => answers.map((answer) => answer?.[move.uci] ?? 0)),
        );
        onProgress?.(++asked);
      }
      const games = counts.get(key);
      moves.forEach((move, m) => {
        const next = positionKey(played(pos, move.uci));
        // Unmeasured moves (no counts) are assumed played.
        const reachedBefore = reached.get(next) ?? NO_BANDS;
        reached.set(
          next,
          reachedBefore.map((was, i) => was || (reach[i] && games?.[m][i] !== 0)),
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

/** The guide's positions, nearest the start first. */
function byDistance(lesson: Lesson): PositionKey[] {
  const start = positionKey(parsePosition(lesson.start)!);
  const order = [start];
  const seen = new Set(order);
  for (let i = 0; i < order.length; i++) {
    const pos = parsePositionKey(order[i])!;
    for (const move of lesson.positions[order[i]].moves) {
      const next = positionKey(played(pos, move.uci));
      if (next in lesson.positions && !seen.has(next)) {
        seen.add(next);
        order.push(next);
      }
    }
  }
  return order;
}
