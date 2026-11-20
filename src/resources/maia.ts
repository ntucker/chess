import { Endpoint } from '@data-client/rest';

import { maiaMove } from '@/maia/engine';

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
// Maia plays the move its network rates highest, so a position's answer never
// changes and stays cached.
export const getMaiaMove = new Endpoint(maiaMove, {
  name: 'getMaiaMove',
  dataExpiryLength: Infinity,
});
