/**
 * The state of a game against an engine (the opponent), as a reducer: the
 * moves, the move on the board, and the opponent's failure to answer them.
 * Everything else (the positions, whose turn it is, whether the opponent is
 * thinking, each move's label) is worked out from these.
 */
import { lastPosition, lineMove } from './replay';

/** Who a game is against. */
export interface GameOpponent {
  /** Names the opponent, so the game notices when a different one takes over. */
  readonly id: string;
  /** The opponent's move (UCI) after `line`, the moves so far. */
  reply(line: readonly string[]): Promise<string>;
}

export interface GameState {
  /** Every move played so far, in UCI. A new array whenever they change, so it names the request for them. */
  readonly moves: readonly string[];
  /** How many of `moves` the board shows: `moves.length` is the latest. */
  readonly ply: number;
  /** The opponent (by id) didn't answer `moves`. Any change to `moves` clears it. */
  readonly failed?: { readonly opponent: string; readonly error: Error };
}

/**
 * An answer from the opponent to the moves it was asked about. It counts only
 * while those are still the game's moves: the same array, so a later move or
 * a new game, even one from the same position, makes it count for nothing.
 */
interface Answer {
  readonly after: readonly string[];
  readonly opponent: string;
}

export type GameAction =
  /** A new game from the starting position. */
  | { readonly type: 'newGame' }
  /** A move from the shown position; moves after it are dropped. */
  | { readonly type: 'move'; readonly uci: string }
  | ({ readonly type: 'reply'; readonly uci: string } & Answer)
  | ({ readonly type: 'failed'; readonly error: Error } & Answer)
  /** Asks the opponent that failed again. */
  | { readonly type: 'retry' }
  | { readonly type: 'goto'; readonly ply: number };

export const initialGame: GameState = { moves: [], ply: 0 };

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return { moves: [], ply: 0 };
    case 'move': {
      const before = state.moves.slice(0, state.ply);
      const uci = lineMove(lastPosition(before).fen, action.uci);
      if (!uci) return state;
      const moves = [...before, uci];
      return { moves, ply: moves.length };
    }
    case 'reply': {
      if (action.after !== state.moves) return state;
      const uci = lineMove(lastPosition(state.moves).fen, action.uci);
      if (!uci) {
        const error = new Error(`The opponent answered with an illegal move: ${action.uci}`);
        return { ...state, failed: { opponent: action.opponent, error } };
      }
      const moves = [...state.moves, uci];
      // Follow the reply only if the player was looking at the latest move.
      return { moves, ply: state.ply === state.moves.length ? moves.length : state.ply };
    }
    case 'failed':
      if (action.after !== state.moves) return state;
      return { ...state, failed: { opponent: action.opponent, error: action.error } };
    case 'retry':
      return state.failed ? { moves: state.moves, ply: state.ply } : state;
    case 'goto':
      return { ...state, ply: Math.max(0, Math.min(action.ply, state.moves.length)) };
  }
}

/**
 * The failure `opponent` (by id) left on the latest moves, if any. A failure
 * by an opponent since replaced doesn't count, so the new one is asked.
 */
export function failure({ failed }: GameState, opponent: string | undefined) {
  return failed?.opponent === opponent ? failed?.error : undefined;
}
