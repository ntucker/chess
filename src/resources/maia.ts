import { Endpoint } from '@data-client/rest';

import { maiaEvaluation, maiaMove } from '@/maia/engine';
import { JUDGE_RATING } from '@/maia/maia';

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
export const getMaiaMove = new Endpoint(maiaMove, { name: 'getMaiaMove' });

export type { Evaluation } from '@/maia/maia';

/**
 * How the position after the moves played so far stands: White's expected
 * score and advantage in pawns, as Maia's judging network sees it. A
 * position's evaluation never changes, so it is kept for as long as the app
 * runs.
 *
 * ```ts
 * const { score, pawns } = useSuspense(getEvaluation, ['e2e4']);
 * ```
 */
export const getEvaluation = new Endpoint(
  (line: readonly string[]) => maiaEvaluation(JUDGE_RATING, line),
  { name: 'getEvaluation', dataExpiryLength: Infinity },
);
