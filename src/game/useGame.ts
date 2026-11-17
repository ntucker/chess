import { useReducer } from 'react';

import { type Color, replay } from './replay';

export interface GameState {
  readonly playerColor: Color;
  /** Every move played so far, in UCI. */
  readonly line: readonly string[];
  /** How many moves of `line` the board shows: `line.length` is the latest. */
  readonly ply: number;
}

export type GameAction =
  | { readonly type: 'newGame'; readonly playerColor: Color }
  /** The player's move from the shown position; moves after it are dropped. */
  | { readonly type: 'move'; readonly uci: string }
  /**
   * The computer's answer to `after`. Ignored if the game has moved on since
   * it was asked (a new game, or the player moved from an earlier position).
   */
  | { readonly type: 'reply'; readonly after: readonly string[]; readonly uci: string }
  | { readonly type: 'goto'; readonly ply: number };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return { playerColor: action.playerColor, line: [], ply: 0 };
    case 'move': {
      const line = [...state.line.slice(0, state.ply), action.uci];
      return { ...state, line, ply: line.length };
    }
    case 'reply': {
      if (!sameLine(state.line, action.after)) return state;
      const line = [...state.line, action.uci];
      // Follow the reply only if the player was looking at the latest move.
      const ply = state.ply === state.line.length ? line.length : state.ply;
      return { ...state, line, ply };
    }
    case 'goto':
      return {
        ...state,
        ply: Math.max(0, Math.min(action.ply, state.line.length)),
      };
  }
}

const sameLine = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((uci, i) => uci === b[i]);

/** A game against the computer: its moves, positions and the shown ply. */
export function useGame(initialColor: Color = 'white') {
  const [state, dispatch] = useReducer(gameReducer, {
    playerColor: initialColor,
    line: [],
    ply: 0,
  });
  const plies = replay(state.line);
  return { ...state, plies, current: plies[state.ply], latest: plies[plies.length - 1], dispatch };
}
