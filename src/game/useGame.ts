import { useController } from '@data-client/react';
import { useReducer } from 'react';

import { getMaiaMove, type MaiaRating } from '@/resources/maia';

import { type GameAction, gameReducer, initialGame } from './game';
import { analyze, type Color, replay, toUci } from './replay';

/**
 * A game against Maia: its moves and positions, the move on the board, and
 * whether Maia is thinking. Every request Maia hasn't answered is tied to the
 * game and moves it was asked about, so a new game or a different move makes
 * its answer (or failure) count for nothing.
 */
export function useGame(rating: MaiaRating) {
  const ctrl = useController();
  const [state, dispatch] = useReducer(gameReducer, initialGame);
  const { playerColor, line, ply, maia } = state;
  const plies = replay(line);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === line.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const thinking = maia.status === 'thinking';

  /** Asks Maia to answer `after`, the moves of game `forGame`. */
  const ask = async (forGame: number, after: readonly string[]) => {
    try {
      const uci = await ctrl.fetch(getMaiaMove, rating, after);
      dispatch({ type: 'reply', game: forGame, after, uci });
    } catch (error) {
      dispatch({
        type: 'failed',
        game: forGame,
        after,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  /** Dispatches `action`, and asks Maia to move if it leaves her thinking. */
  const act = (action: GameAction) => {
    const next = gameReducer(state, action);
    dispatch(action);
    if (next.maia.status === 'thinking') ask(next.game, next.line);
  };

  return {
    playerColor,
    line,
    ply,
    plies,
    current,
    latest,
    atLatest,
    /** Whose move it is in the latest position; none once the game is over. */
    toMove: latest.result ? undefined : latest.turn,
    // While Maia thinks the player can still go back and try another move.
    canMove: !current.result && current.turn === playerColor && !(atLatest && thinking),
    /** Whether the player has made a move, so a new game would lose something. */
    started: plies.some((p) => p.move && p.turn !== playerColor),
    thinking,
    error: maia.status === 'failed' ? maia.error : undefined,
    /** Plays the player's move between two squares on the shown position. */
    move(from: string, to: string) {
      act({ type: 'move', uci: toUci(current, from, to) });
    },
    newGame(side: Color) {
      act({ type: 'newGame', playerColor: side });
    },
    retry() {
      if (maia.status === 'failed') act({ type: 'retry' });
    },
    goto(target: number) {
      dispatch({ type: 'goto', ply: target });
    },
  };
}
