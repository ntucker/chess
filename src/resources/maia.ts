import { Endpoint } from '@data-client/rest';

import { maiaMove, maiaShares } from '@/maia/engine';

// Maia (https://www.maiachess.com) is a neural network trained to play like
// people of a given rating rather than to play the best move. Its networks
// ship with the app and run on the device, off the main thread
// (src/maia/engine.ts).

/**
 * Maia's move (UCI, like `e7e5`) after the moves played so far (UCI, from the
 * starting position).
 *
 * ```ts
 * const uci = await ctrl.fetch(getMaiaMove, 1500, ['e2e4']);
 * ```
 */
export const getMaiaMove = new Endpoint(maiaMove, {
  name: 'getMaiaMove',
  // Maia plays the move its network rates highest, so a position's answer
  // never changes. A failure goes stale at once (after the millisecond it
  // came in), so the next ask tries again.
  dataExpiryLength: Infinity,
  errorExpiryLength: 0,
});

/**
 * How often Maia expects people of a rating to play each legal move after the
 * moves played so far (UCI, from the starting position), adding up to 1:
 * the opportunity finder's replies where no lichess counts are at hand.
 *
 * ```ts
 * const shares = await ctrl.fetch(getMaiaShares, 1400, ['e2e4']);
 * shares.e7e5; // 0.4
 * ```
 */
export const getMaiaShares = new Endpoint(maiaShares, {
  name: 'getMaiaShares',
  // The network's answer for a position never changes; a failure is asked again.
  dataExpiryLength: Infinity,
  errorExpiryLength: 0,
});
