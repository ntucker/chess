import { useController } from '@data-client/react';
import { useReducer } from 'react';

import { getMaiaMove, type MaiaRating } from '@/resources/maia';

import { awaitsMaia, gameReducer, initialGame } from './game';
import { analyze, type Color, isLegal, replay, toUci } from './replay';

/** The last position of `line`, ready for the board. */
const lastPosition = (line: readonly string[]) => {
  const plies = replay(line);
  return analyze(plies[plies.length - 1]);
};

/**
 * A game against Maia: its moves and positions, the move on the board, and
 * whether Maia is thinking. Every request Maia hasn't answered is tied to the
 * game and moves it was asked about, so a new game or a different move makes
 * its answer (or failure) count for nothing.
 */
export function useGame(rating: MaiaRating) {
  const ctrl = useController();
  const [state, dispatch] = useReducer(gameReducer, initialGame);
  const { game, playerColor, line, ply, maia } = state;
  const plies = replay(line);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === line.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const thinking = maia.status === 'thinking';

  /** Asks Maia to answer `after`, which ends in the position `fen`. */
  const ask = async (forGame: number, after: readonly string[], fen: string) => {
    try {
      const { top_move } = await ctrl.fetch(getMaiaMove, { rating }, after);
      if (!isLegal(fen, top_move)) {
        throw new Error(`Maia answered with an illegal move: ${top_move}`);
      }
      dispatch({ type: 'reply', game: forGame, after, uci: top_move });
    } catch (error) {
      dispatch({
        type: 'failed',
        game: forGame,
        after,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
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
      const next = [...line.slice(0, ply), toUci(current, from, to)];
      const position = lastPosition(next);
      const asks = awaitsMaia(position, playerColor);
      dispatch({ type: 'move', line: next, ask: asks });
      if (asks) ask(game, next, position.fen);
    },
    newGame(side: Color) {
      const start = lastPosition([]);
      const asks = awaitsMaia(start, side);
      dispatch({ type: 'newGame', playerColor: side, ask: asks });
      if (asks) ask(game + 1, [], start.fen);
    },
    retry() {
      if (maia.status !== 'failed') return;
      dispatch({ type: 'retry' });
      ask(game, line, latest.fen);
    },
    goto(target: number) {
      dispatch({ type: 'goto', ply: target });
    },
  };
}
