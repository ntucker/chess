import { Endpoint } from '@data-client/rest';

import { maiaMove } from '@/maia/engine';
import type { MaiaRating } from '@/maia/models';

export type { MaiaRating } from '@/maia/models';

/** Maia answers in milliseconds; a pause reads as a reply rather than a reflex. */
const THINKING_MS = 400;

/**
 * Maia's move (UCI, like `e7e5`) after the moves played so far (UCI, from the
 * starting position). Maia (https://www.maiachess.com) is a neural network
 * trained to play like people of a given rating rather than to play the best
 * move. Its networks ship with the app and run on the device (src/maia), in a
 * Web Worker on the web.
 *
 * ```ts
 * const uci = await ctrl.fetch(getMaiaMove, 1500, ['e2e4']);
 * ```
 */
export const getMaiaMove = new Endpoint(
  async (rating: MaiaRating, line: readonly string[]): Promise<string> => {
    const [move] = await Promise.all([
      maiaMove(rating, line),
      new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
    ]);
    return move;
  },
  { name: 'getMaiaMove' },
);
