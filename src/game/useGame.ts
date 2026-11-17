import { useController } from '@data-client/react';
import { useReducer } from 'react';

import { getMaiaMove, type MaiaRating } from '@/resources/maia';

import { type Color, replay, toUci } from './replay';

export interface GameState {
  /** Counts games, so answers to an earlier game's request are dropped. */
  readonly game: number;
  readonly playerColor: Color;
  /** Every move played so far, in UCI. */
  readonly line: readonly string[];
  /** How many moves of `line` the board shows: `line.length` is the latest. */
  readonly ply: number;
  /** The moves Maia is answering, while a request is out. */
  readonly waiting?: readonly string[];
  /** Why Maia's answer to `after` never came. */
  readonly failed?: { readonly after: readonly string[]; readonly error: Error };
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

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return {
        game: state.game + 1,
        playerColor: action.playerColor,
        line: [],
        ply: 0,
        waiting: action.playerColor === 'black' ? [] : undefined,
      };
    case 'move': {
      const line = [...state.line.slice(0, state.ply), action.uci];
      return { ...state, line, ply: line.length, waiting: action.ask ? line : undefined, failed: undefined };
    }
    case 'reply': {
      if (!answers(state, action)) return state;
      const line = [...state.line, action.uci];
      // Follow the reply only if the player was looking at the latest move.
      const ply = state.ply === state.line.length ? line.length : state.ply;
      return { ...state, line, ply, waiting: undefined };
    }
    case 'failed':
      if (!answers(state, action)) return state;
      return { ...state, waiting: undefined, failed: { after: action.after, error: action.error } };
    case 'retry':
      if (!state.failed) return state;
      return { ...state, waiting: state.failed.after, failed: undefined };
    case 'goto':
      return { ...state, ply: Math.max(0, Math.min(action.ply, state.line.length)) };
  }
}

/** Whether a response is for the request this game is waiting on. */
const answers = (state: GameState, response: { game: number; after: readonly string[] }) =>
  response.game === state.game &&
  state.waiting !== undefined &&
  sameLine(state.waiting, response.after) &&
  sameLine(state.line, response.after);

const sameLine = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((uci, i) => uci === b[i]);

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
      dispatch({ type: 'failed', game, after, error: error as Error });
    }
  };

  return {
    ...state,
    plies,
    current,
    latest: plies[plies.length - 1],
    thinking: state.waiting !== undefined,
    /** Plays the player's move between two squares on the shown position. */
    move(from: string, to: string) {
      const uci = toUci(current, from, to);
      const next = [...state.line.slice(0, state.ply), uci];
      const ends = replay(next).at(-1)?.result !== undefined;
      dispatch({ type: 'move', uci, ask: !ends });
      if (!ends) ask(state.game, next);
    },
    newGame(playerColor: Color) {
      dispatch({ type: 'newGame', playerColor });
      if (playerColor === 'black') ask(state.game + 1, []);
    },
    retry() {
      if (!state.failed) return;
      dispatch({ type: 'retry' });
      ask(state.game, state.failed.after);
    },
    goto(ply: number) {
      dispatch({ type: 'goto', ply });
    },
  };
}
