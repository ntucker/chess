import { Endpoint } from '@data-client/rest';

import { maiaMove } from '@/maia/engine';
import type { MaiaRating } from '@/maia/models';
import type { Opponent, OpponentEngine } from '@/opponent/opponent';
import { stockfishEvaluation } from '@/stockfish/engine';

/** How each engine picks the opponent's move after `line`. */
const MOVES: Record<
  OpponentEngine,
  (rating: MaiaRating, line: readonly string[]) => Promise<string>
> = {
  maia: maiaMove,
  stockfish: async (_, line) => {
    const { best } = await stockfishEvaluation(line);
    if (!best) throw new Error('Stockfish found no move');
    return best;
  },
};

/**
 * The opponent's move after the moves played so far (UCI, from the starting
 * position), in UCI. Both engines run on the device, off the main thread.
 *
 * - `maia`: the move people rated about the opponent's rating tend to play
 *   (https://www.maiachess.com), from the matching network.
 * - `stockfish`: Stockfish's best move whatever the rating, from the search
 *   the evaluation bar uses (about depth 16). It needs StockfishHost mounted.
 *
 * Maia writes castling as the king taking its rook (`e1h1`), Stockfish as
 * the king's two-square move (`e1g1`); `lineMove` reads both.
 *
 * ```ts
 * const uci = await ctrl.fetch(getOpponentMove, { engine: 'maia', rating: 1500 }, ['e2e4']);
 * ```
 */
export const getOpponentMove = new Endpoint(
  ({ engine, rating }: Opponent, line: readonly string[]) => MOVES[engine](rating, line),
  { name: 'getOpponentMove' },
);
