import { useController } from '@data-client/react';
import { useReducer } from 'react';

import { classifyMove } from '@/analysis/quality';
import { type Evaluation, resultEvaluation } from '@/evaluation/evaluation';
import { useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import type { MaiaRating } from '@/maia/models';
import { getEvaluation } from '@/resources/evaluation';
import { getMaiaMove } from '@/resources/maia';

import { type GameAction, gameReducer, type GameState, initialGame } from './game';
import { material } from './material';
import { analyze, type Color, lastPosition, replay, toUci } from './replay';

/** The least time Maia takes to reply, so a fast answer reads as a reply, not a reflex. */
const THINKING_MS = 400;

/**
 * A game against Maia: its moves and positions, how good each move was, the
 * move on the board, and whether Maia is thinking. Every request Maia or the
 * evaluation engine hasn't answered is tied to the game and moves it was
 * asked about, so a new game or a different move makes its answer (or
 * failure) count for nothing.
 */
export function useGame(rating: MaiaRating) {
  const ctrl = useController();
  const engine = useEvaluationEngine();
  const [state, dispatch] = useReducer(gameReducer, initialGame);
  const { playerColor, line, qualities, ply, maia } = state;
  const plies = replay(line);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === line.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const thinking = maia.status === 'thinking';

  /** Asks Maia to answer the moves of `asked`, the state that wants her reply. */
  const ask = async (asked: GameState) => {
    const { game, line: after } = asked;
    try {
      const [uci] = await Promise.all([
        ctrl.fetch(getMaiaMove, rating, after),
        new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
      ]);
      act({ type: 'reply', game, after, uci }, asked);
    } catch (error) {
      dispatch({
        type: 'failed',
        game,
        after,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  /** How the position after `moves` stands: from the engine, or from the result once the game is over. */
  const evaluate = async (moves: readonly string[]): Promise<Evaluation> => {
    const { result } = lastPosition(moves);
    return result ? resultEvaluation(result) : ctrl.fetchIfStale(getEvaluation, engine, moves);
  };

  /** Labels the last move of `judged`, the moves of game `game`. */
  const judge = async (game: number, judged: readonly string[]) => {
    const before = judged.slice(0, -1);
    try {
      const evaluations = await Promise.all([evaluate(before), evaluate(judged)]);
      const quality = classifyMove({
        before: evaluations[0],
        after: evaluations[1],
        uci: judged[judged.length - 1],
        mover: lastPosition(before).turn,
      });
      dispatch({ type: 'judged', game, line: judged, quality });
    } catch {
      // The evaluation failed (Data Client keeps the error); the move stays unlabelled.
    }
  };

  /**
   * Dispatches `action`, then asks Maia to move if it leaves her thinking and
   * judges the move it adds. `from` is the state the action applies to: the
   * one rendered, or for Maia's reply, the state that asked for it.
   */
  const act = (action: GameAction, from: GameState = state) => {
    const next = gameReducer(from, action);
    dispatch(action);
    if (next.maia.status === 'thinking') ask(next);
    if (next.line !== from.line && next.line.length) judge(next.game, next.line);
  };

  return {
    playerColor,
    line,
    /** Each move's label once it's judged: `qualities[n]` labels the move that leads to `plies[n + 1]`. */
    qualities,
    ply,
    plies,
    current,
    /** What each side is up on the board shown, so it follows the moves stepped through. */
    material: material(current.fen),
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

