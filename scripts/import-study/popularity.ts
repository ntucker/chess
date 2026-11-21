/**
 * How often lichess players make each guide move, per rating band, from the
 * lichess opening explorer (https://explorer.lichess.ovh). The explorer
 * refuses requests without a lichess token, and lichess asks for one request
 * at a time and a full minute's pause after a 429.
 */

import { parsePosition, parsePositionKey, positionKey, recordedMove } from '@/game/replay';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';

import { answersFile } from './jsonLines';
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
  /**
   * The lesson's committed answers file, read before lichess is asked and
   * appended to as answers arrive, so a stopped crawl resumes where it left off.
   */
  readonly cacheFile: string;
  /** The date an answer lichess gives now is stamped with (default: today, UTC). */
  readonly today?: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** An answers file row: what the explorer answered for `<band> <position>`, and on which date. */
type ExplorerRow = readonly [id: string, counts: LichessCounts, date: string];

export interface LichessExplorer {
  readonly ask: Explorer;
  /** The latest date among the answers asked for so far: when their counts were fetched. */
  readonly answeredOn: () => string | undefined;
  /** Rewrites the answers file with only the answers asked for. */
  readonly saveUsed: () => void;
}

/** The most moves the explorer lists for a position: more than any guide position has. */
const MAX_MOVES = 100;
const RETRY_AFTER_MS = 60_000;
const ALL_BANDS: readonly boolean[] = RATING_BANDS.map(() => true);
const NO_BANDS: readonly boolean[] = RATING_BANDS.map(() => false);
/** Measured: one request every 2.5 s draws no 429s (about 24 a minute); faster ones do. */
const REQUEST_INTERVAL_MS = 2_500;

/**
 * The lichess explorer, answering from `cacheFile` first. The file keeps
 * lichess's own UCI (castling as the king taking its rook, `e1h1`); answers
 * use the lesson's (`e1g1`). Rows without a date are asked again.
 */
export function lichessExplorer({
  token,
  cacheFile,
  today = new Date().toISOString().slice(0, 10),
  fetch: get = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ExplorerOptions): LichessExplorer {
  const cache = answersFile<ExplorerRow>(
    cacheFile,
    ([id]) => id,
    ([, , date]) => typeof date === 'string',
  );
  let answeredOn: string | undefined;
  let lastRequest = -Infinity;
  const paced = async (url: URL) => {
    await sleep(Math.max(0, lastRequest + REQUEST_INTERVAL_MS - Date.now()));
    lastRequest = Date.now();
    return get(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  const ask: Explorer = async (key, band) => {
    const id = `${band} ${key}`;
    const [, counts, date] = cache.get(id) ?? (await fetched(id, key, band));
    if (!answeredOn || date > answeredOn) answeredOn = date;
    return recordedCounts(key, counts);
  };
  const fetched = async (id: string, key: PositionKey, band: number): Promise<ExplorerRow> => {
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
      const body = (await response.json()) as {
        moves: { uci: string; white: number; draws: number; black: number }[];
      };
      const counts = Object.fromEntries(
        body.moves.map((move) => [move.uci, move.white + move.draws + move.black]),
      );
      const row: ExplorerRow = [id, counts, today];
      cache.add(id, row);
      return row;
    }
  };
  return {
    ask,
    answeredOn: () => answeredOn,
    saveUsed: cache.saveUsed,
  };
}

/**
 * `counts` with each move as lesson files write it (`recordedMove`). A move
 * `recordedMove` rejects keeps lichess's key, which no lesson move asks for.
 */
function recordedCounts(key: PositionKey, counts: LichessCounts): MoveCounts {
  const pos = parsePositionKey(key)!;
  return Object.fromEntries(
    Object.entries(counts).map(([uci, games]) => [recordedMove(pos, uci) ?? uci, games]),
  );
}

/**
 * `lesson` with games per band for the moves of each position where the side
 * to move has a choice: the opponent's first, nearest the start first, then
 * the learner's. Moves without a choice get no counts ("not measured"), and
 * counts already in `lesson` are replaced. `date` says when the counts were
 * fetched; it is asked once the crawl is done.
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
  date: () => string,
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
        for (const [i, band] of RATING_BANDS.entries())
          answers.push(here[i] ? await explorer(key, band) : undefined);
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
    popularity: { ratingBands: RATING_BANDS, speeds: SPEEDS, date: date() },
    positions: Object.fromEntries(
      Object.entries(lesson.positions).map(([key, entry]) => {
        const games = counts.get(key);
        // Counts already in the file are replaced, or dropped where nothing was asked.
        const moves = entry.moves.map(({ games: _, ...move }, m) =>
          games ? { ...move, games: games[m] } : move,
        );
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
