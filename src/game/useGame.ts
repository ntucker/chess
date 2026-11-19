import { useController } from '@data-client/react';
import { useLayoutEffect, useReducer, useRef } from 'react';

import { classifyMove } from '@/analysis/quality';
import { useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import { getEvaluation } from '@/resources/evaluation';

import { type GameAction, gameReducer, initialGame } from './game';
import { material } from './material';
import { analyze, type Color, lastPosition, replay, toUci } from './replay';

/** The least time the opponent takes to reply, so a fast answer reads as a reply, not a reflex. */
const THINKING_MS = 400;

/**
 * A game against an opponent: its moves and positions, how good each move
 * was, the move on the board, and whether the opponent is thinking. `reply`
 * answers the moves so far with the opponent's move (UCI); who the opponent
 * is, is the caller's business. Every request the opponent or the evaluation
 * engine hasn't answered is tied to the game and moves it was asked about, so
 * a new game or a different move makes its answer (or failure) count for
 * nothing.
 */
export function useGame(reply: (line: readonly string[]) => Promise<string>) {
  const ctrl = useController();
  const engine = useEvaluationEngine();
  const [state, dispatch] = useReducer(gameReducer, initialGame);
  const { playerColor, line, qualities, ply } = state;
  const plies = replay(line);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === line.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const thinking = state.opponent.status === 'thinking';
  // The state as last rendered, which the opponent's reply applies to: it arrives
  // after renders that the request that asked for it didn't see.
  const rendered = useRef(state);
  useLayoutEffect(() => {
    rendered.current = state;
  });

  /** Asks the opponent to answer `after`, the moves of game `game`. */
  const ask = async (game: number, after: readonly string[]) => {
    try {
      const [uci] = await Promise.all([
        reply(after),
        new Promise((resolve) => setTimeout(resolve, THINKING_MS)),
      ]);
      act({ type: 'reply', game, after, uci });
    } catch (error) {
      dispatch({
        type: 'failed',
        game,
        after,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  /** Labels the last move of `judged`, the moves of game `game`. */
  const judge = async (game: number, judged: readonly string[]) => {
    const previous = judged.slice(0, -1);
    try {
      const [before, after] = await Promise.all([
        ctrl.fetchIfStale(getEvaluation, engine, previous),
        ctrl.fetchIfStale(getEvaluation, engine, judged),
      ]);
      const quality = classifyMove({
        before,
        after,
        uci: judged[judged.length - 1],
        mover: lastPosition(previous).turn,
      });
      dispatch({ type: 'judged', game, line: judged, quality });
    } catch {
      // The evaluation failed (Data Client keeps the error); the move stays unlabelled.
    }
  };

  /**
   * Dispatches `action`, then asks the opponent to move if it leaves it
   * thinking, and judges the move it adds.
   */
  const act = (action: GameAction) => {
    const from = rendered.current;
    const next = gameReducer(from, action);
    dispatch(action);
    // Nothing changed (a late reply, an illegal move: the reducer returns the
    // same state), so nothing to start.
    if (next === from) return;
    if (next.opponent.status === 'thinking') ask(next.game, next.line);
    if (next.line !== from.line && next.line.length) judge(next.game, next.line);
  };

  return {
    playerColor,
    line,
    /** Each move's label once it's judged: `qualities[n]` labels `line[n]`, the move that leads to `plies[n + 1]`. */
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
    // While the opponent thinks the player can still go back and try another move.
    canMove: !current.result && current.turn === playerColor && !(atLatest && thinking),
    /** Whether the player has made a move, so a new game would lose something. */
    started: plies.some((p) => p.move && p.turn !== playerColor),
    thinking,
    error: state.opponent.status === 'failed' ? state.opponent.error : undefined,
    /** Plays the player's move between two squares on the shown position. */
    move(from: string, to: string) {
      act({ type: 'move', uci: toUci(current, from, to) });
    },
    newGame(side: Color) {
      act({ type: 'newGame', playerColor: side });
    },
    retry() {
      if (state.opponent.status === 'failed') act({ type: 'retry' });
    },
    goto(target: number) {
      dispatch({ type: 'goto', ply: target });
    },
  };
}

