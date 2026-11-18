import { Endpoint } from '@data-client/rest';

import type { Evaluation, EvaluationEngine } from '@/evaluation/evaluation';
import { maiaEvaluation } from '@/maia/engine';
import { JUDGE_RATING } from '@/maia/maia';
import { stockfishEvaluation } from '@/stockfish/engine';

export type { Evaluation, EvaluationEngine } from '@/evaluation/evaluation';

type Evaluate = (line: readonly string[]) => Promise<Evaluation>;

/**
 * How the position after the moves played so far stands, as each engine
 * judges it: White's expected score, advantage in pawns, and moves to mate
 * when Stockfish sees one. Both engines run on the device, off the main
 * thread. A position's evaluation never changes, so it is kept for as long as
 * the app runs.
 *
 * - `stockfish`: Stockfish 19 lite, searching about 16 moves deep
 *   (src/stockfish). It needs StockfishHost mounted. Its failures are never
 *   kept: a request only fails when a newer position replaces it
 *   (SupersededError), which says nothing about its own position, so coming
 *   back to that position evaluates it again.
 * - `maia`: Maia 1900's value head, how players of that rating tend to score
 *   from here (src/maia).
 *
 * ```ts
 * const { score, pawns } = useSuspense(getEvaluation[engine], ['e2e4']);
 * ```
 */
export const getEvaluation = {
  stockfish: new Endpoint<Evaluate>(stockfishEvaluation, {
    name: 'getStockfishEvaluation',
    dataExpiryLength: Infinity,
    errorExpiryLength: 0,
  }),
  maia: new Endpoint<Evaluate>((line) => maiaEvaluation(JUDGE_RATING, line), {
    name: 'getMaiaEvaluation',
    dataExpiryLength: Infinity,
  }),
} satisfies Record<EvaluationEngine, unknown>;
