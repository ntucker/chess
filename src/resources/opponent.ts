import { type Controller, useController } from '@data-client/react';
import { Endpoint } from '@data-client/rest';
import { useEffect } from 'react';

import type { Analysis } from '@/evaluation/evaluation';
import type { GameOpponent } from '@/game/game';
import { isStockfish, type Opponent } from '@/opponent/opponent';
import { fullStockfish } from '@/stockfish/engine';

import { getAnalysis } from './analysis';
import { getMaiaMove } from './maia';

/**
 * The opponent's move after `line` (UCI moves from the starting position), in
 * UCI. Both engines run on the device, off the main thread.
 *
 * - A rating: the move Maia's network for that rating picks, the way people
 *   rated about that tend to play.
 * - `stockfish`: Stockfish's best move, the first line of the position's
 *   final analysis (`getAnalysis`), so it plays the move the board's arrow
 *   shows. A position the bar or move labels already searched, or are
 *   searching, costs no new search. It needs StockfishHost mounted.
 * - `stockfish-full`: full Stockfish's best move (`getFullStockfishMove`),
 *   its own search, which the bar and labels don't share. It needs
 *   FullStockfishHost mounted, which downloads it the first time.
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
  if (opponent === 'stockfish-full') return ctrl.fetchIfStale(getFullStockfishMove, line);
  if (opponent !== 'stockfish') return ctrl.fetchIfStale(getMaiaMove, opponent, line);
  return bestMove(await ctrl.fetchIfStale(getAnalysis, 'stockfish', line));
}

/** The first line's move of Stockfish's final analysis. */
function bestMove({ lines }: Analysis): string {
  const best = lines[0]?.uci;
  if (!best) throw new Error('Stockfish found no move');
  return best;
}

/**
 * Full Stockfish's move (UCI) after `line`, the first line of its search
 * (`FULL_SEARCH`). Like Maia's, a position's answer never changes, and a
 * failure goes stale at once so the next ask tries again.
 */
export const getFullStockfishMove = new Endpoint(
  async (line: readonly string[]) => bestMove(await fullStockfish.analysis(line)),
  { name: 'getFullStockfishMove', dataExpiryLength: Infinity, errorExpiryLength: 0 },
);

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
 * Stockfish starts with its host (`StockfishWhileNeeded`).
 */
export function useWarmOpponent(opponent: Opponent, active: boolean) {
  const ctrl = useController();
  // An effect, not useFetch, which fetches during render: the web export
  // pre-renders screens and must not start an engine.
  useEffect(() => {
    if (!active || isStockfish(opponent)) return;
    // Unawaited, a failure is only stored, and Maia's move asks again
    // (getMaiaMove's failures go stale at once).
    ctrl.fetchIfStale(getMaiaMove, opponent, []);
  }, [ctrl, opponent, active]);
}
