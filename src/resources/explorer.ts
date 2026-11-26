import { Endpoint } from '@data-client/rest';

import type { PositionKey } from '@/lesson/lesson';
import { ExplorerRefusal, pacedExplorer, recordedCounts } from '@/lichess/explorer';
import type { MoveCounts } from '@/opportunity/walk';

import { lichessToken } from './accounts';

/** Every request the app sends the explorer, at lichess's pace (`pacedExplorer`). */
const askLichess = pacedExplorer();

/** What lichess players in a band played at a position: games per move, and the games reaching it. */
export interface ExplorerCounts {
  readonly counts: MoveCounts;
  readonly total: number;
}

/**
 * The lichess explorer's counts at the position `key` in the rating band
 * `band` (`RATING_BANDS`), its moves as lesson files write them, asked with
 * the signed-in account's token. It fails when nobody is signed in, since
 * the explorer refuses requests without a token. Counts change slowly, so an
 * answer is kept for a day. A refusal (`ExplorerRefusal`, which signs out on
 * a 401: `LichessRefusals`) is passed on only while the token it refused is
 * still the saved one, so a request queued before signing in again can't
 * sign out the new account.
 *
 * ```ts
 * const { counts, total } = await ctrl.fetch(getExplorerCounts, 1400, key);
 * ```
 */
export const getExplorerCounts = new Endpoint(
  async (band: number, key: PositionKey): Promise<ExplorerCounts> => {
    const token = lichessToken();
    if (!token) throw new Error('Sign in with lichess to ask its explorer');
    try {
      const { counts, total } = await askLichess(key, band, token);
      return { counts: recordedCounts(key, counts), total };
    } catch (error) {
      if (error instanceof ExplorerRefusal && lichessToken() !== token) {
        throw new Error('lichess refused a token since signed out of', { cause: error });
      }
      throw error;
    }
  },
  { name: 'getExplorerCounts', dataExpiryLength: 24 * 60 * 60 * 1000 },
);
