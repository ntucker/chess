import { Endpoint } from '@data-client/rest';

import { chooseMove } from '@/maia/maia';
import { loadMaia, type MaiaRating } from '@/maia/models';

export type { MaiaRating } from '@/maia/models';

/** Maia answers in milliseconds; a pause reads as a reply rather than a reflex. */
const THINKING_MS = 400;

/**
 * Maia's move (UCI, like `e7e5`) after the moves played so far (UCI, from the
 * starting position). Maia (https://www.maiachess.com) is a neural network
 * trained to play like people of a given rating rather than to play the best
 * move. Its networks ship with the app and run on the device (src/maia).
 *
 * ```ts
 * const uci = await ctrl.fetch(getMaiaMove, 1500, ['e2e4']);
 * ```
 */
export const getMaiaMove = new Endpoint(
  async (rating: MaiaRating, line: readonly string[]): Promise<string> => {
    const [network] = await Promise.all([
      loadMaia(rating),
      new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
    ]);
    return chooseMove(network, line);
  },
  { name: 'getMaiaMove' },
);
