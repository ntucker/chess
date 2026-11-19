import { useEffect, useEffectEvent, useReducer } from 'react';

import { useMoveQualities } from '@/analysis/useMoveQualities';

import { failure, type GameOpponent, gameReducer, initialGame } from './game';
import { material } from './material';
import { analyze, type Color, replay, toUci } from './replay';

/** The least time the opponent takes to reply, so a fast answer reads as a reply, not a reflex. */
const THINKING_MS = 400;

interface Options {
  /** The player's side; the opponent plays the other. */
  readonly side: Color;
  /**
   * Whether the screen is in front. Behind another screen the game asks the
   * opponent nothing, and asks once it's in front again.
   */
  readonly active: boolean;
}

/**
 * A game against `opponent`, or against nobody when it's undefined: its moves
 * and positions, the move on the board, its label, and whether the opponent
 * is thinking. Who the opponent is, is the caller's business.
 *
 * The opponent is asked whenever it's its turn at the latest position and it
 * hasn't failed to answer it, so a new game, a move, a retry, a different
 * opponent or the screen coming to the front all ask without special cases.
 * An answer counts only while the moves it answers are still the game's (the
 * reducer's one check), so a late one from an earlier position or game is
 * dropped; one from an opponent since replaced still answers the same
 * position, so the first answer wins.
 */
export function useGame(opponent: GameOpponent | undefined, { side, active }: Options) {
  const [state, dispatch] = useReducer(gameReducer, initialGame);
  const { moves, ply } = state;
  const plies = replay(moves);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === moves.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const qualities = useMoveQualities(plies, ply);
  const error = failure(state, opponent?.id);
  const thinking = !!opponent && !latest.result && latest.turn !== side && !error;

  const ask = useEffectEvent(async (after: readonly string[]) => {
    if (!opponent) return;
    const answer = { after, opponent: opponent.id };
    try {
      const [uci] = await Promise.all([
        opponent.reply(after),
        new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
      ]);
      dispatch({ type: 'reply', uci, ...answer });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      dispatch({ type: 'failed', error, ...answer });
    }
  });
  // Coming back to the front while a request is out asks again; Data Client
  // shares the request still running, so the engine searches once.
  useEffect(() => {
    if (active && thinking) ask(moves);
  }, [active, thinking, moves, opponent?.id]);

  return {
    moves,
    ply,
    plies,
    current,
    /** Each move's label once it's judged: `qualities[n]` labels `moves[n]`, the move that leads to `plies[n + 1]`. */
    qualities,
    /** The label of the move that led to `current`, once it's judged. */
    quality: qualities[ply - 1],
    /** What each side is up on the board shown, so it follows the moves stepped through. */
    material: material(current.fen),
    latest,
    atLatest,
    /** Whose move it is in the latest position; none once the game is over. */
    toMove: latest.result ? undefined : latest.turn,
    // While the opponent thinks the player can still go back and try another move.
    canMove: !current.result && current.turn === side && !(atLatest && thinking),
    /** Whether the player has made a move, so a new game would lose something. */
    started: plies.some((p) => p.move && p.turn !== side),
    thinking,
    error,
    /** Plays the player's move between two squares on the shown position. */
    move(from: string, to: string) {
      dispatch({ type: 'move', uci: toUci(current, from, to) });
    },
    /** Plays the player's move `uci` on the shown position, promotion included. */
    play(uci: string) {
      dispatch({ type: 'move', uci });
    },
    /** Starts again from the starting position; the caller picks the side. */
    newGame() {
      dispatch({ type: 'newGame' });
    },
    /** Asks the opponent again about the moves it failed to answer. */
    retry() {
      dispatch({ type: 'retry' });
    },
    goto(target: number) {
      dispatch({ type: 'goto', ply: target });
    },
  };
}
