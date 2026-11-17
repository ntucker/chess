/**
 * The state of a game against Maia, as a reducer: the moves, the move on the
 * board, and the one request to Maia that may be out. Pure, so it can be
 * tested without React.
 */
import type { Color, Position } from './replay';

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
  /** `ask` when Maia moves first. */
  | { readonly type: 'newGame'; readonly playerColor: Color; readonly ask: boolean }
  /** The game after the player's move; `ask` when Maia should answer it. */
  | { readonly type: 'move'; readonly line: readonly string[]; readonly ask: boolean }
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

/** Before the first game: the player is White and nothing is played. */
export const initialGame: GameState = {
  game: 0,
  playerColor: 'white',
  line: [],
  ply: 0,
  maia: IDLE,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return {
        game: state.game + 1,
        playerColor: action.playerColor,
        line: [],
        ply: 0,
        maia: action.ask ? THINKING : IDLE,
      };
    case 'move':
      return {
        ...state,
        line: action.line,
        ply: action.line.length,
        maia: action.ask ? THINKING : IDLE,
      };
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

/** Whether a response is for the request this game is waiting on. */
const answers = (state: GameState, response: { game: number; after: readonly string[] }) =>
  response.game === state.game &&
  state.maia.status === 'thinking' &&
  state.line.length === response.after.length &&
  state.line.every((uci, i) => uci === response.after[i]);

/** Maia moves when it's her turn and the game goes on. */
export const awaitsMaia = (position: Position, playerColor: Color) =>
  !position.result && position.turn !== playerColor;
