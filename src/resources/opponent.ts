import { type Controller, useController } from '@data-client/react';
import { useEffect } from 'react';

import type { GameOpponent } from '@/game/game';
import type { Opponent } from '@/opponent/opponent';

import { getEvaluation } from './evaluation';
import { getMaiaMove } from './maia';

/**
 * The opponent's move after `line` (UCI moves from the starting position), in
 * UCI. Both engines run on the device, off the main thread.
 *
 * - A rating: the move Maia's network for that rating picks, the way people
 *   rated about that tend to play.
 * - `stockfish`: Stockfish's best move, from the search that evaluates the
 *   position (`getEvaluation`, about depth 16). A position
 *   the evaluation bar or move labels already searched, or are searching,
 *   costs no new search. It needs StockfishHost mounted.
 *
 * Maia writes castling as the king taking its rook (`e1h1`), Stockfish as the
 * king's two-square move (`e1g1`); `lineMove` reads both.
 *
 * ```ts
 * const uci = await fetchOpponentMove(ctrl, 1500, ['e2e4']);
 * ```
 */
export async function fetchOpponentMove(
  ctrl: Controller,
  opponent: Opponent,
  line: readonly string[],
): Promise<string> {
  if (opponent !== 'stockfish') return ctrl.fetch(getMaiaMove, opponent, line);
  const { best } = await ctrl.fetchIfStale(getEvaluation, 'stockfish', line);
  if (!best) throw new Error('Stockfish found no move');
  return best;
}

/** `opponent` as the opponent of a game (useGame). */
export function gameOpponent(ctrl: Controller, opponent: Opponent): GameOpponent {
  return {
    id: String(opponent),
    reply: (line) => fetchOpponentMove(ctrl, opponent, line),
  };
}

/**
 * Starts `opponent`'s engine while `active`, so it's ready before its first
 * move: Maia loads its worker and network by answering the starting position.
 * That also fetches the worker while the page's own build is still the one
 * deployed. Stockfish starts with its host (`useNeedsStockfish`).
 */
export function useWarmOpponent(opponent: Opponent, active: boolean) {
  const ctrl = useController();
  // An effect, not useFetch, which fetches during render: the web export
  // pre-renders screens and must not start an engine.
  useEffect(() => {
    if (!active || opponent === 'stockfish') return;
    // A failure shows when Maia has to play, and that move asks again.
    ctrl.fetchIfStale(getMaiaMove, opponent, []).catch(() => {});
  }, [ctrl, opponent, active]);
}
