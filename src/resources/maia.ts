import { RestEndpoint } from '@data-client/rest';

import { MAIA_API_ORIGIN, MAIA_MOVE_PATH } from './maiaApi';

/**
 * Maia (https://www.maiachess.com) is a neural network chess engine trained
 * to play like people of a given rating rather than to play the best move.
 *
 * Native apps call it directly; the web build goes through a proxy (see
 * src/server/maiaProxy.ts), at EXPO_PUBLIC_MAIA_PROXY_URL on GitHub Pages.
 */
const urlPrefix =
  process.env.EXPO_OS !== 'web'
    ? MAIA_API_ORIGIN
    : process.env.EXPO_PUBLIC_MAIA_PROXY_URL || '/api/maia';

/** Maia models, by the rating of the players each was trained on. */
export const MAIA_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] as const;
export type MaiaRating = (typeof MAIA_RATINGS)[number];

export interface MaiaMove {
  /** Maia's move, in UCI (`e7e5`, `e7e8q`). */
  readonly top_move: string;
  /** How long a person might take to play it, in seconds. */
  readonly move_delay: number;
}

/**
 * Maia's move after the moves played so far (UCI, from the starting position).
 *
 * ```ts
 * const { top_move } = await ctrl.fetch(getMaiaMove, { rating: 1500 }, ['e2e4']);
 * ```
 */
export const getMaiaMove = new RestEndpoint({
  urlPrefix,
  path: MAIA_MOVE_PATH,
  method: 'POST',
  searchParams: {} as { rating: MaiaRating },
  body: [] as readonly string[],
  process(value: MaiaMove): MaiaMove {
    return value;
  },
  searchToString({ rating }: { rating: MaiaRating }) {
    return new URLSearchParams({
      maia_name: `maia_kdd_${rating}`,
      maia_version: 'maia3',
      // No clock: Maia plays as if it had all the time it wants.
      initial_clock: '0',
      current_clock: '0',
      increment: '0',
    }).toString();
  },
});
