/**
 * How often lichess players make each guide move, per rating band, from the
 * lichess opening explorer (https://explorer.lichess.ovh). The explorer
 * refuses requests without a lichess token, and lichess asks for one request
 * at a time and a full minute's pause after a 429.
 */

import { parsePosition, parsePositionKey, positionKey, recordedMove } from '@/game/replay';
import type { Lesson, LessonMove, LessonPosition, PositionKey } from '@/lesson/lesson';
import type { MoveCounts } from '@/opportunity/walk';

import { answersFile } from './jsonLines';
import { played } from './study';

/** The explorer's bands the app reads (see `ratingBandIndex`), each counting ratings up to the next. */
export const RATING_BANDS = [1000, 1200, 1400, 1600, 1800];
/** Bullet games are left out: they are played too fast to say what players choose. */
const SPEEDS = ['blitz', 'rapid', 'classical'];

export type { MoveCounts };
/** Games per move as lichess writes moves (castling as the king taking its rook, `e1h1`). */
type LichessCounts = Readonly<Record<string, number>>;

/** What the explorer answered for a position in one band. */
export interface ExplorerAnswer {
  readonly counts: MoveCounts;
  /**
   * The games reaching the position: the explorer's own count, which also
   * counts games that ended there. Absent where the cached answer predates
   * totals: unknown, never 0 or the sum of `counts`.
   */
  readonly total?: number;
}

/**
 * The explorer for one position and band. With `total`, a cached answer
 * without one is asked again, so the answer has it.
 */
export type Explorer = (
  key: PositionKey,
  band: number,
  options?: { readonly total?: boolean },
) => Promise<ExplorerAnswer>;

interface ExplorerOptions {
  readonly token?: string;
  /**
   * The lesson's committed answers file, read before lichess is asked and
   * appended to as answers arrive, so a stopped crawl resumes where it left off.
   */
  readonly cacheFile: string;
  /** Ask lichess again about everything, replacing the file's answers once saved. */
  readonly fresh?: boolean;
  /** The date an answer lichess gives now is stamped with (default: today, UTC). */
  readonly today?: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * An answers file row: what the explorer answered for `<band> <position>`, on
 * which date, and the games reaching the position (rows from before totals
 * were kept have none).
 */
type ExplorerRow = readonly [id: string, counts: LichessCounts, date: string, total?: number];

export interface LichessExplorer {
  readonly ask: Explorer;
  /** When the counts asked for so far were fetched: the latest of their dates, or `today`. */
  readonly answeredOn: () => string;
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
 * use the lesson's (`e1g1`).
 */
export function lichessExplorer({
  token,
  cacheFile,
  fresh = false,
  today = new Date().toISOString().slice(0, 10),
  fetch: get = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ExplorerOptions): LichessExplorer {
  const cache = answersFile<ExplorerRow>(
    cacheFile,
    ([id]) => id,
    () => !fresh,
  );
  let answeredOn: string | undefined;
  let lastRequest = -Infinity;
  const paced = async (url: URL) => {
    await sleep(Math.max(0, lastRequest + REQUEST_INTERVAL_MS - Date.now()));
    lastRequest = Date.now();
    return get(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  const ask: Explorer = async (key, band, { total: needed = false } = {}) => {
    const id = `${band} ${key}`;
    const cached = cache.get(id);
    const [, counts, date, total] =
      cached && (!needed || cached[3] !== undefined) ? cached : await fetched(id, key, band);
    if (!answeredOn || date > answeredOn) answeredOn = date;
    return { counts: recordedCounts(key, counts), ...(total !== undefined && { total }) };
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
      const body = (await response.json()) as Games & { moves: (Games & { uci: string })[] };
      const counts = Object.fromEntries(body.moves.map((move) => [move.uci, gameCount(move)]));
      const row: ExplorerRow = [id, counts, today, gameCount(body)];
      cache.add(row);
      return row;
    }
  };
  return {
    ask,
    answeredOn: () => answeredOn ?? today,
    saveUsed: cache.saveUsed,
  };
}

/** The explorer's results for a position or a move. */
interface Games {
  readonly white: number;
  readonly draws: number;
  readonly black: number;
}

const gameCount = ({ white, draws, black }: Games) => white + draws + black;

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
 * the learner's. Where it asks, it replaces the counts already in `lesson`
 * and writes the games reaching the position (`LessonPosition.games`) from
 * the same answers, or none where an answer predates totals; elsewhere it
 * keeps what `lesson` has (`addPathCounts` measures the line each find's mark plays), so a
 * position without a choice has counts only where that step wrote them.
 * `date` says when the counts were fetched; it is asked once the crawl is done.
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
  const counts = new Map<PositionKey, Measured>();
  let asked = 0;
  const crawl = async (wanted: (key: PositionKey) => boolean) => {
    /** Per band, whether some game can reach each position, as far as the counts so far tell. */
    const reached = new Map([[start, ALL_BANDS]]);
    for (const [key, next] of order) {
      const moves = lesson.positions[key].moves;
      // The position that first led here comes earlier in `order`, so this one has an entry.
      const here = reached.get(key)!;
      if (wanted(key) && !counts.has(key)) {
        const answers: (ExplorerAnswer | undefined)[] = [];
        for (const [i, band] of RATING_BANDS.entries())
          answers.push(here[i] ? await explorer(key, band) : undefined);
        counts.set(key, measured(moves, answers));
        onProgress?.(++asked);
      }
      const games = counts.get(key)?.moves;
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
        return [key, games ? withCounts(entry, games) : entry];
      }),
    ),
  };
}

/** What the explorer said about one position: games per move (one count per band, as `moves`), and reaching it. */
interface Measured {
  readonly moves: readonly (readonly number[])[];
  readonly total?: readonly number[];
}

/**
 * `moves`' games per band from `answers`, one per band (undefined for a band
 * not asked, which counts 0), and the games reaching the position where every
 * answer asked has its total.
 */
export function measured(
  moves: readonly LessonMove[],
  answers: readonly (ExplorerAnswer | undefined)[],
): Measured {
  const totals = answers.map((answer) => (answer ? answer.total : 0));
  return {
    moves: moves.map((move) => answers.map((answer) => answer?.counts[move.uci] ?? 0)),
    ...(totals.every((total) => total !== undefined) && { total: totals }),
  };
}

/** Whether `entry` carries lichess counts (`withCounts` writes them): on the position or on a move. */
export const isCounted = (entry: LessonPosition): boolean =>
  entry.games !== undefined || entry.moves.some((move) => move.games !== undefined);

/** `entry` with the games `games` measured, replacing any it had: none reaching it where `games` has no total. */
export function withCounts(entry: LessonPosition, { moves, total }: Measured): LessonPosition {
  const { games: _, ...rest } = entry;
  return {
    ...rest,
    moves: entry.moves.map((move, m) => ({ ...move, games: moves[m] })),
    ...(total && { games: total }),
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

/**
 * `lesson` with the counts of the positions at `keys` measured afresh: each
 * move's games and the games reaching the position, per band, from one
 * explorer answer each (asked with its total). Example: the positions on a
 * find's path, which popularity doesn't ask about where the guide offers no
 * choice.
 */
export async function recount(
  lesson: Lesson,
  keys: Iterable<PositionKey>,
  explorer: Explorer,
): Promise<Lesson> {
  const positions = { ...lesson.positions };
  for (const key of keys) {
    const answers = [];
    for (const band of RATING_BANDS) answers.push(await explorer(key, band, { total: true }));
    positions[key] = withCounts(positions[key], measured(positions[key].moves, answers));
  }
  return { ...lesson, positions };
}
