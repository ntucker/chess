import { Endpoint } from '@data-client/rest';

import type { EvaluationEngine } from '@/evaluation/evaluation';
import { maiaEvaluation } from '@/maia/engine';
import { JUDGE_RATING } from '@/maia/maia';
import { stockfishEvaluation } from '@/stockfish/engine';

export type { Evaluation, EvaluationEngine } from '@/evaluation/evaluation';

/**
 * How the position after the moves played so far stands, as `engine` judges
 * it: White's expected score, advantage in pawns, and moves to mate when
 * Stockfish sees one. Both engines run on the device, off the main thread.
 * A position's evaluation never changes, so it is kept for as long as the app
 * runs. A failure is never kept: it's almost always a newer position
 * replacing this one (SupersededError), which says nothing about this one,
 * so coming back to it evaluates it again.
 *
 * - `stockfish`: Stockfish 19 lite, searching about 16 moves deep
 *   (src/stockfish). It needs StockfishHost mounted.
 * - `maia`: Maia 1900's value head, how players of that rating tend to score
 *   from here (src/maia).
 *
 * ```ts
 * const { score, pawns } = useSuspense(getEvaluation, 'stockfish', ['e2e4']);
 * ```
 */
export const getEvaluation = new Endpoint(
  (engine: EvaluationEngine, line: readonly string[]) =>
    engine === 'maia' ? maiaEvaluation(JUDGE_RATING, line) : stockfishEvaluation(line),
  { name: 'getEvaluation', dataExpiryLength: Infinity, errorExpiryLength: 0 },
);
