import { useController } from '@data-client/react';
import { useReducer } from 'react';

import { getMaiaMove, type MaiaRating } from '@/resources/maia';

import { type Color, replay, toUci } from './replay';

/** What Maia is doing about the latest position. */
export type MaiaStatus =
  | { readonly status: 'idle' }
  /** Answering the moves in `line`. */
  | { readonly status: 'thinking' }
  /** Didn't answer the moves in `line`. */
  | { readonly status: 'failed'; readonly error: Error };

export interface GameState {
  /** Counts games, so answers to an earlier game's request are dropped. */
  readonly game: number;
  readonly playerColor: Color;
  /** Every move played so far, in UCI. */
  readonly line: readonly string[];
  /** How many moves of `line` the board shows: `line.length` is the latest. */
  readonly ply: number;
  readonly maia: MaiaStatus;
}

export type GameAction =
  | { readonly type: 'newGame'; readonly playerColor: Color }
  /**
   * The player's move from the shown position; moves after it are dropped.
   * `ask` when Maia should answer it (the game isn't over).
   */
  | { readonly type: 'move'; readonly uci: string; readonly ask: boolean }
  /** Maia's answer, applied only if it answers the request still out. */
  | {
      readonly type: 'reply';
      readonly game: number;
      readonly after: readonly string[];
      readonly uci: string;
    }
  | {
      readonly type: 'failed';
      readonly game: number;
      readonly after: readonly string[];
      readonly error: Error;
    }
  | { readonly type: 'retry' }
  | { readonly type: 'goto'; readonly ply: number };

const IDLE: MaiaStatus = { status: 'idle' };
const THINKING: MaiaStatus = { status: 'thinking' };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return {
        game: state.game + 1,
        playerColor: action.playerColor,
        line: [],
        ply: 0,
        maia: action.playerColor === 'black' ? THINKING : IDLE,
      };
    case 'move': {
      const line = playFromShown(state, action.uci);
      return { ...state, line, ply: line.length, maia: action.ask ? THINKING : IDLE };
    }
    case 'reply': {
      if (!answers(state, action)) return state;
      const line = [...state.line, action.uci];
      // Follow the reply only if the player was looking at the latest move.
      const ply = state.ply === state.line.length ? line.length : state.ply;
      return { ...state, line, ply, maia: IDLE };
    }
    case 'failed':
      if (!answers(state, action)) return state;
      return { ...state, maia: { status: 'failed', error: action.error } };
    case 'retry':
      if (state.maia.status !== 'failed') return state;
      return { ...state, maia: THINKING };
    case 'goto':
      return { ...state, ply: Math.max(0, Math.min(action.ply, state.line.length)) };
  }
}

/** The line after playing `uci` on the shown position, dropping later moves. */
const playFromShown = (state: GameState, uci: string) => [...state.line.slice(0, state.ply), uci];

/** Whether a response is for the request this game is waiting on. */
const answers = (state: GameState, response: { game: number; after: readonly string[] }) =>
  response.game === state.game &&
  state.maia.status === 'thinking' &&
  state.line.length === response.after.length &&
  state.line.every((uci, i) => uci === response.after[i]);

/**
 * A game against Maia: its moves and positions, the move on the board, and
 * whether Maia is thinking. Every request Maia hasn't answered is tied to the
 * game and moves it was asked about, so a new game or a different move makes
 * its answer (or failure) count for nothing.
 */
export function useGame(rating: MaiaRating) {
  const ctrl = useController();
  const [state, dispatch] = useReducer(gameReducer, {
    game: 0,
    playerColor: 'white',
    line: [],
    ply: 0,
    maia: IDLE,
  });
  const plies = replay(state.line);
  const current = plies[state.ply];

  const ask = async (game: number, after: readonly string[]) => {
    try {
      const { top_move } = await ctrl.fetch(getMaiaMove, { rating }, after);
      if (replay([...after, top_move]).length !== after.length + 2) {
        throw new Error(`Maia answered with an illegal move: ${top_move}`);
      }
      dispatch({ type: 'reply', game, after, uci: top_move });
    } catch (error) {
      dispatch({
        type: 'failed',
        game,
        after,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  return {
    ...state,
    plies,
    current,
    latest: plies[plies.length - 1],
    thinking: state.maia.status === 'thinking',
    error: state.maia.status === 'failed' ? state.maia.error : undefined,
    /** Plays the player's move between two squares on the shown position. */
    move(from: string, to: string) {
      const uci = toUci(current, from, to);
      const line = playFromShown(state, uci);
      const ends = replay(line).at(-1)?.result !== undefined;
      dispatch({ type: 'move', uci, ask: !ends });
      if (!ends) ask(state.game, line);
    },
    newGame(playerColor: Color) {
      dispatch({ type: 'newGame', playerColor });
      if (playerColor === 'black') ask(state.game + 1, []);
    },
    retry() {
      if (state.maia.status !== 'failed') return;
      dispatch({ type: 'retry' });
      ask(state.game, state.line);
    },
    goto(ply: number) {
      dispatch({ type: 'goto', ply });
    },
  };
}
