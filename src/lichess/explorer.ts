/**
 * The lichess opening explorer (https://explorer.lichess.ovh), which the
 * importer and the app both ask. It refuses requests without a lichess token,
 * and lichess asks for one request at a time and a full minute's pause after
 * a 429.
 */

import { parsePositionKey, recordedMove } from '@/game/replay';
import type { PositionKey } from '@/lesson/lesson';
import type { MoveCounts } from '@/opportunity/walk';

/** The explorer's bands the app reads (see `ratingBandIndex`), each counting ratings up to the next. */
export const RATING_BANDS = [1000, 1200, 1400, 1600, 1800];
/** Bullet games are left out: they are played too fast to say what players choose. */
export const SPEEDS = ['blitz', 'rapid', 'classical'];

/** Games per move as lichess writes moves (castling as the king taking its rook, `e1h1`). */
export type LichessCounts = Readonly<Record<string, number>>;

/** What lichess answered for a position in one band, its moves as lichess writes them. */
export interface LichessAnswer {
  readonly counts: LichessCounts;
  /** The games reaching the position: the explorer's own count, which also counts games that ended there. */
  readonly total: number;
}

/** Asks the explorer about the position `key` in `band`, with the user's `token`. */
export type AskLichess = (key: PositionKey, band: number, token?: string) => Promise<LichessAnswer>;

/** The most moves the explorer lists for a position: more than any guide position has. */
const MAX_MOVES = 100;
/** Measured: one request every 2.5 s draws no 429s (about 24 a minute); faster ones do. */
export const REQUEST_INTERVAL_MS = 2_500;
const RETRY_AFTER_MS = 60_000;

interface Options {
  readonly fetch?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/** The explorer refused a request: `status` 401 means the token is no longer good. */
export class ExplorerRefusal extends Error {
  constructor(
    readonly status: number,
    asked: string,
  ) {
    super(`Explorer answered ${status} for ${asked}`);
  }
}

/**
 * The explorer, one request every `REQUEST_INTERVAL_MS` however many ask at
 * once, all waiting a minute after a 429 and then asking again; it throws
 * `ExplorerRefusal` on any other refusal. Make one for every
 * caller that shares a token, so they share its pace.
 *
 * ```ts
 * const ask = pacedExplorer();
 * const { counts, total } = await ask(key, 1400, token);
 * ```
 */
export function pacedExplorer({
  // Looked up when it asks, so a fetch set after this module loads is the one used.
  fetch: get = (url, init) => fetch(url, init),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: Options = {}): AskLichess {
  // When the next request may go: each caller takes the next free slot.
  let next = -Infinity;
  // Until when lichess asked every caller to wait (a 429).
  let pausedUntil = -Infinity;
  const paced = async (url: URL, token: string | undefined) => {
    let slot: number;
    // A turn that falls in a pause begun since it was taken is taken again, after the pause.
    do {
      slot = Math.max(Date.now(), next, pausedUntil);
      next = slot + REQUEST_INTERVAL_MS;
      await sleep(slot - Date.now());
    } while (slot < pausedUntil);
    return get(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  };
  return async (key, band, token) => {
    const url = explorerUrl(key, band);
    for (;;) {
      const response = await paced(url, token);
      if (response.status === 429) {
        // Every caller waits out the minute, those already waiting for a turn too.
        pausedUntil = Date.now() + RETRY_AFTER_MS;
        continue;
      }
      if (!response.ok) throw new ExplorerRefusal(response.status, `${band} ${key}`);
      const body = (await response.json()) as Games & { moves: (Games & { uci: string })[] };
      return {
        counts: Object.fromEntries(body.moves.map((move) => [move.uci, gameCount(move)])),
        total: gameCount(body),
      };
    }
  };
}

const explorerUrl = (key: PositionKey, band: number) => {
  const url = new URL('https://explorer.lichess.ovh/lichess');
  url.search = new URLSearchParams({
    fen: `${key} 0 1`,
    ratings: String(band),
    speeds: SPEEDS.join(','),
    moves: String(MAX_MOVES),
    topGames: '0',
    recentGames: '0',
  }).toString();
  return url;
};

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
export function recordedCounts(key: PositionKey, counts: LichessCounts): MoveCounts {
  const pos = parsePositionKey(key)!;
  return Object.fromEntries(
    Object.entries(counts).map(([uci, games]) => [recordedMove(pos, uci) ?? uci, games]),
  );
}
