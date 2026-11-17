import { useController } from '@data-client/react';
import { useReducer } from 'react';

import { getMaiaMove, type MaiaRating } from '@/resources/maia';

import { analyze, type Color, isLegal, type Position, replay, toUci } from './replay';

/** What Maia is doing about the latest position. */
type MaiaStatus =
  | { readonly status: 'idle' }
  /** Answering the moves in `line`. */
  | { readonly status: 'thinking' }
  /** Didn't answer the moves in `line`. */
  | { readonly status: 'failed'; readonly error: Error };

interface GameState {
  /** Counts games, so answers to an earlier game's request are dropped. */
  readonly game: number;
  readonly playerColor: Color;
  /** Every move played so far, in UCI. */
  readonly line: readonly string[];
  /** How many moves of `line` the board shows: `line.length` is the latest. */
  readonly ply: number;
  readonly maia: MaiaStatus;
}

type GameAction =
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

function gameReducer(state: GameState, action: GameAction): GameState {
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
const awaitsMaia = (position: Position, playerColor: Color) =>
  !position.result && position.turn !== playerColor;

/** The last position of `line`, ready for the board. */
const lastPosition = (line: readonly string[]) => {
  const plies = replay(line);
  return analyze(plies[plies.length - 1]);
};

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
  const { game, playerColor, line, ply, maia } = state;
  const plies = replay(line);
  const latest = analyze(plies[plies.length - 1]);
  const atLatest = ply === line.length;
  const current = atLatest ? latest : analyze(plies[ply]);
  const thinking = maia.status === 'thinking';

  /** Asks Maia to answer `after`, which ends in the position `fen`. */
  const ask = async (forGame: number, after: readonly string[], fen: string) => {
    try {
      const { top_move } = await ctrl.fetch(getMaiaMove, { rating }, after);
      if (!isLegal(fen, top_move)) {
        throw new Error(`Maia answered with an illegal move: ${top_move}`);
      }
      dispatch({ type: 'reply', game: forGame, after, uci: top_move });
    } catch (error) {
      dispatch({
        type: 'failed',
        game: forGame,
        after,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  };

  return {
    playerColor,
    line,
    ply,
    plies,
    current,
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
      const next = [...line.slice(0, ply), toUci(current, from, to)];
      const position = lastPosition(next);
      const asks = awaitsMaia(position, playerColor);
      dispatch({ type: 'move', line: next, ask: asks });
      if (asks) ask(game, next, position.fen);
    },
    newGame(side: Color) {
      const start = lastPosition([]);
      const asks = awaitsMaia(start, side);
      dispatch({ type: 'newGame', playerColor: side, ask: asks });
      if (asks) ask(game + 1, [], start.fen);
    },
    retry() {
      if (maia.status !== 'failed') return;
      dispatch({ type: 'retry' });
      ask(game, line, latest.fen);
    },
    goto(target: number) {
      dispatch({ type: 'goto', ply: target });
    },
  };
}
