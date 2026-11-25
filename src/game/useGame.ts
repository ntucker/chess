import { type Dispatch, useEffect, useEffectEvent } from 'react';

import { useMoveQualities } from '@/analysis/useMoveQualities';
import type { EvaluationEngine } from '@/evaluation/evaluation';

import { failure, type GameAction, type GameOpponent, type GameState } from './game';
import { captures } from './material';
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
  /** The engine that judges each move for its label. */
  readonly judge: EvaluationEngine;
  /** Which of the game's moves a lesson's guide recommends: labelled `book`, never judged. */
  readonly book?: readonly boolean[];
  /**
   * Whether to label the board's move now (by default, while `active`).
   * A lesson waits while a try at a cue waits for its verdict, so the
   * searches the verdict needs are the newest ones watched.
   */
  readonly labelling?: boolean;
}

/**
 * A game's state and its dispatch: `useReducer(gameReducer, initialGame)`,
 * held by the screen, so the screen can read the moves before it knows the
 * rest of what `useGame` takes (a lesson is picked by its first move).
 */
export type GameStore = readonly [GameState, Dispatch<GameAction>];

/**
 * A game against `opponent`, or against nobody when it's undefined: its moves
 * and positions, the move on the board, its label, and whether the opponent
 * is thinking. Who the opponent is, is the caller's business.
 *
 * The opponent is asked whenever it's its turn at the latest position and it
 * hasn't failed to answer it, so a new game, a move, a retry, a different
 * opponent or the screen coming to the front all ask without special cases.
 * Each request belongs to the effect that made it: once anything it asked
 * with changes (the moves, the opponent, nobody playing it, the screen going
 * behind), its answer or failure counts for nothing, and the next request
 * is the one that counts.
 */
export function useGame(
  [state, dispatch]: GameStore,
  opponent: GameOpponent | undefined,
  { side, active, judge, book, labelling = true }: Options,
) {
  const { moves, ply } = state;
  const plies = replay(moves);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === moves.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const { qualities, refutations } = useMoveQualities(
    plies,
    active && labelling ? ply : null,
    judge,
    book,
  );
  const error = failure(state, opponent?.id);
  const thinking = !!opponent && !latest.result && latest.turn !== side && !error;
  const replying = atLatest && thinking;

  /** Asks the opponent about `after`, and answers the game while `wanted()`. */
  const ask = useEffectEvent(async (after: readonly string[], wanted: () => boolean) => {
    if (!opponent) return;
    const answer = { after, opponent: opponent.id };
    let action: GameAction;
    try {
      const [uci] = await Promise.all([
        opponent.reply(after),
        new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
      ]);
      action = { type: 'reply', uci, ...answer };
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      action = { type: 'failed', error, ...answer };
    }
    if (wanted()) dispatch(action);
  });
  // Coming back to the front while a request is out asks again; Data Client
  // shares the request still running, so the engine searches once.
  useEffect(() => {
    if (!active || !thinking) return;
    let ignore = false;
    ask(moves, () => !ignore);
    return () => {
      ignore = true;
    };
  }, [active, thinking, moves, opponent?.id]);

  /**
   * Starts again from the starting position; the caller picks the side.
   * Outside the object below, the React Compiler keeps it the same function
   * from move to move, so a header given it doesn't redraw on each move.
   */
  const newGame = () => dispatch({ type: 'newGame' });

  return {
    moves,
    ply,
    plies,
    current,
    /** Each move's label once it's judged: `qualities[n]` labels `moves[n]`, the move that leads to `plies[n + 1]`. */
    qualities,
    /** The label of the move that led to `current`, once it's judged. */
    quality: qualities[ply - 1],
    /**
     * The reply that punishes the mistake or blunder that led to `current`,
     * when one clearly does (`refutation`), whoever played it: the screen
     * decides whose it shows.
     */
    refutation: refutations[ply - 1],
    /** What each side is up and has taken by the move shown, so it follows the moves stepped through. */
    captures: captures(plies, ply),
    latest,
    atLatest,
    /** Whose move it is in the latest position; none once the game is over. */
    toMove: latest.result ? undefined : latest.turn,
    // While the opponent thinks the player can still go back and try another move.
    // With no opponent, nobody replies: the player moves both sides.
    canMove: !current.result && !replying && (!opponent || current.turn === side),
    /** Whether the player has made a move, so a new game would lose something. */
    started: plies.some((p) => p.move && p.turn !== side),
    thinking,
    /**
     * Whether the opponent is replying while the board shows the latest move.
     * The board follows a reply only from there, so it will move on by itself.
     */
    replying,
    error,
    /** Plays the player's move between two squares on the shown position. */
    move(from: string, to: string) {
      dispatch({ type: 'move', uci: toUci(current, from, to) });
    },
    /** Plays the player's move `uci` on the shown position, promotion included. */
    play(uci: string) {
      dispatch({ type: 'move', uci });
    },
    newGame,
    /** Asks the opponent again about the moves it failed to answer. */
    retry() {
      dispatch({ type: 'retry' });
    },
    goto(target: number) {
      dispatch({ type: 'goto', ply: target });
    },
  };
}

/** A game on a screen: what `useGame` returns. */
export type Game = ReturnType<typeof useGame>;
