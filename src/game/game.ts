/**
 * The state of a game against Maia, as a reducer: the moves, how good each
 * was, the move on the board, and the one request to Maia that may be out.
 */
import type { MoveQuality } from '@/analysis/quality';

import { type Color, lastPosition, lineMove } from './replay';

/** What Maia is doing about the latest position. */
type MaiaStatus =
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
  /** Each move's label once it's judged: `qualities[n]` labels `line[n]`. */
  readonly qualities: readonly (MoveQuality | undefined)[];
  /** How many moves of `line` the board shows: `line.length` is the latest. */
  readonly ply: number;
  readonly maia: MaiaStatus;
}

export type GameAction =
  | { readonly type: 'newGame'; readonly playerColor: Color }
  /** The player's move from the shown position; moves after it are dropped. */
  | { readonly type: 'move'; readonly uci: string }
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
  /** The label for the last of `line`'s moves, applied only if that move is still played. */
  | {
      readonly type: 'judged';
      readonly game: number;
      readonly line: readonly string[];
      readonly quality: MoveQuality;
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
  qualities: [],
  ply: 0,
  maia: IDLE,
};

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'newGame':
      return start(
        { ...state, game: state.game + 1, playerColor: action.playerColor, qualities: [] },
        [],
      );
    case 'move': {
      const before = state.line.slice(0, state.ply);
      const uci = lineMove(lastPosition(before).fen, action.uci);
      if (!uci) return state;
      return start({ ...state, qualities: state.qualities.slice(0, before.length) }, [
        ...before,
        uci,
      ]);
    }
    case 'reply': {
      if (!answers(state, action)) return state;
      const uci = lineMove(lastPosition(state.line).fen, action.uci);
      if (!uci) {
        const error = new Error(`Maia answered with an illegal move: ${action.uci}`);
        return { ...state, maia: { status: 'failed', error } };
      }
      const line = [...state.line, uci];
      // Follow the reply only if the player was looking at the latest move.
      const ply = state.ply === state.line.length ? line.length : state.ply;
      return { ...state, line, ply, maia: IDLE };
    }
    case 'failed':
      if (!answers(state, action)) return state;
      return { ...state, maia: { status: 'failed', error: action.error } };
    case 'judged': {
      if (action.game !== state.game || !startsWith(state.line, action.line)) return state;
      const labelled = action.line.length - 1;
      const qualities = state.line.map((_, n) => (n === labelled ? action.quality : state.qualities[n]));
      return { ...state, qualities };
    }
    case 'retry':
      if (state.maia.status !== 'failed') return state;
      return { ...state, maia: THINKING };
    case 'goto':
      return { ...state, ply: Math.max(0, Math.min(action.ply, state.line.length)) };
  }
}

/** Shows the latest move of `line`, with Maia thinking if it's her turn. */
function start(state: GameState, line: readonly string[]): GameState {
  const position = lastPosition(line);
  const maiaToMove = !position.result && position.turn !== state.playerColor;
  return { ...state, line, ply: line.length, maia: maiaToMove ? THINKING : IDLE };
}

/** Whether a response is for the request this game is waiting on. */
const answers = (state: GameState, response: { game: number; after: readonly string[] }) =>
  response.game === state.game &&
  state.maia.status === 'thinking' &&
  state.line.length === response.after.length &&
  startsWith(state.line, response.after);

/** Whether `line` begins with the moves of `prefix`. */
const startsWith = (line: readonly string[], prefix: readonly string[]) =>
  prefix.length <= line.length && prefix.every((uci, i) => uci === line[i]);
