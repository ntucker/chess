import type { Controller } from '@data-client/react';

import type { Opponent } from '@/opponent/opponent';

import { getEvaluation } from './evaluation';
import { getMaiaMove } from './maia';

/**
 * The opponent's move after `line` (UCI moves from the starting position), in
 * UCI. Both engines run on the device, off the main thread.
 *
 * - `maia`: the move people rated about the opponent's rating tend to play,
 *   from the matching network.
 * - `stockfish`: Stockfish's best move whatever the rating, from the search
 *   that evaluates the position (`getEvaluation`, about depth 16). A position
 *   the evaluation bar or move labels already searched, or are searching,
 *   costs no new search. It needs StockfishHost mounted.
 *
 * Maia writes castling as the king taking its rook (`e1h1`), Stockfish as the
 * king's two-square move (`e1g1`); `lineMove` reads both.
 *
 * ```ts
 * const uci = await fetchOpponentMove(ctrl, { engine: 'maia', rating: 1500 }, ['e2e4']);
 * ```
 */
export async function fetchOpponentMove(
  ctrl: Controller,
  { engine, rating }: Opponent,
  line: readonly string[],
): Promise<string> {
  if (engine === 'maia') return ctrl.fetch(getMaiaMove, rating, line);
  const { best } = await ctrl.fetchIfStale(getEvaluation, 'stockfish', line);
  if (!best) throw new Error('Stockfish found no move');
  return best;
}
