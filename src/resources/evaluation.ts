import { Endpoint } from '@data-client/rest';

import type { Evaluation, EvaluationEngine } from '@/evaluation/evaluation';
import { maiaEvaluation } from '@/maia/engine';
import { JUDGE_RATING } from '@/maia/maia';
import { stockfishEvaluation } from '@/stockfish/engine';

/** How each engine evaluates the position after `line`. */
const JUDGES: Record<EvaluationEngine, (line: readonly string[]) => Promise<Evaluation>> = {
  stockfish: stockfishEvaluation,
  maia: (line) => maiaEvaluation(JUDGE_RATING, line),
};

/**
 * How the position after the moves played so far stands, as `engine` judges
 * it: White's expected score, advantage in pawns, and moves to mate and the
 * best move when Stockfish sees them. Both engines run on the device, off the main thread.
 * A position's evaluation never changes, so it is kept for as long as the app
 * runs.
 *
 * - `stockfish`: Stockfish 19 lite (src/stockfish). It needs StockfishHost
 *   mounted, and searches one position at a time, newest first.
 * - `maia`: Maia 1900's value head, how players of that rating tend to score
 *   from here (src/maia).
 *
 * ```ts
 * const { score, pawns } = useSuspense(getEvaluation, 'stockfish', ['e2e4']);
 * ```
 */
export const getEvaluation = new Endpoint(
  (engine: EvaluationEngine, line: readonly string[]) => JUDGES[engine](line),
  { name: 'getEvaluation', dataExpiryLength: Infinity },
);
