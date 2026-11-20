import { Endpoint } from '@data-client/rest';

import {
  type Evaluation,
  type EvaluationEngine,
  resultEvaluation,
  type TopMove,
} from '@/evaluation/evaluation';
import { lastPosition } from '@/game/replay';
import { maiaEvaluation } from '@/maia/engine';
import { JUDGE_RATING } from '@/maia/maia';
import { stockfishEvaluation, stockfishTopMoves } from '@/stockfish/engine';

/** How each engine evaluates the position after `line`. */
const JUDGES: Record<EvaluationEngine, (line: readonly string[]) => Promise<Evaluation>> = {
  stockfish: stockfishEvaluation,
  maia: (line) => maiaEvaluation(JUDGE_RATING, line),
};

/**
 * How the position after the moves played so far stands, as `engine` judges
 * it: White's expected score, advantage in pawns, and moves to mate and the
 * best move when Stockfish sees them. Both engines run on the device, off the
 * main thread; a finished game is scored by its result instead (1, 0.5 or 0).
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
  async (engine: EvaluationEngine, line: readonly string[]) => {
    const { result } = lastPosition(line);
    return result ? resultEvaluation(result) : JUDGES[engine](line);
  },
  { name: 'getEvaluation', dataExpiryLength: Infinity },
);

/**
 * Stockfish's three best moves in the position after `line`, best first,
 * each with how the position stands after it (`stockfishTopMoves`); none once
 * the game is over. Its search runs once that position's evaluation has, and
 * a position the screen has left is dropped, so ask for it beside
 * `getEvaluation` freely. Kept for as long as the app runs.
 *
 * ```ts
 * const top = useSuspense(getTopMoves, ['e2e4']); // [{ uci: 'c7c5', evaluation }, …]
 * ```
 */
function fetchTopMoves(line: readonly string[], signal?: AbortSignal): Promise<readonly TopMove[]> {
  return lastPosition(line).result ? Promise.resolve([]) : stockfishTopMoves(line, signal);
}

export const getTopMoves = new Endpoint((line: readonly string[]) => fetchTopMoves(line), {
  name: 'getTopMoves',
  dataExpiryLength: Infinity,
});

/**
 * `getTopMoves`, aborted when `signal` aborts. The same key, so the cache is
 * shared. The signal is closed over: a browser calls the endpoint with no `this`.
 */
export function topMovesSearch(signal?: AbortSignal) {
  // `name` has to be set again: extending copies own fields, and an
  // endpoint's name is a getter, so without it the copy's cache key changes
  // and the screen never sees the result.
  return signal
    ? getTopMoves.extend({
        name: getTopMoves.name,
        fetch: (line: readonly string[]) => fetchTopMoves(line, signal),
      })
    : getTopMoves;
}
