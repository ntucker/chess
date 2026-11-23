/**
 * The review page's one reducer: the move shown, the Stockfish row pointed
 * at, the plies visited (for Next moment), the ply the board has rested on,
 * each moment's tries and answers shown, and what the board shows at a
 * moment (`retry.ts`). Everything else the page shows is worked out from these, the moves
 * and the analyses in the store (`review.ts`, `order.ts`, `accuracy.ts`).
 */
import type { Uci } from '@/lesson/lesson';

export interface ReviewScreen {
  /** The game reviewed: the learner's side and the moves, as `reviewedGame` writes them. */
  readonly game: string;
  /** The position shown, `plies[ply]`; 0, before any move, is the summary. */
  readonly ply: number;
  /** The move of the Stockfish row pointed at, previewed on the board. */
  readonly pointed?: Uci;
  /** Every ply the board has shown, so Next moment skips the moments seen. */
  readonly visited: ReadonlySet<number>;
  /**
   * `ply` once the board has rested on it about a second (`DWELL_MS`): its
   * move's positions are searched next if it isn't judged yet (`nextSearch`).
   * Stepping on clears it, so stepping through doesn't restart the search.
   */
  readonly dwelt?: number;
  /** The learner's tries at each moment, by its ply, oldest first: coming back shows them. */
  readonly tries: ReadonlyMap<number, readonly Uci[]>;
  /** The moments whose answer Show best has shown, by ply. */
  readonly shown: ReadonlySet<number>;
  /**
   * What the board shows at the moment at `ply` in place of its move: the
   * position before it, for a try (`retry`); the latest try (`try`); or the
   * answer Show best shows (`answer`). Going to another ply ends it.
   */
  readonly board?: 'retry' | 'try' | 'answer';
}

export type ReviewAction =
  /** Starts the review afresh if `game` is another game than the one reviewed. */
  | { readonly type: 'review'; readonly game: string }
  /** Shows `plies[ply]`, or the end it's past: the arrow keys step past either end. */
  | { readonly type: 'goto'; readonly ply: number }
  /** Points at the row of `uci`, or at none. */
  | { readonly type: 'point'; readonly uci?: Uci }
  /** The board has shown `ply` for `DWELL_MS`. */
  | { readonly type: 'dwell'; readonly ply: number }
  /** Retry: the board goes back one move for a try at the moment shown. */
  | { readonly type: 'retry' }
  /** The learner tries `uci` at the moment shown, and the board shows it. */
  | { readonly type: 'try'; readonly uci: Uci }
  /** Show best: the moment shown shows its answer, on the board too. */
  | { readonly type: 'show answer' };

/** How long the board rests on a move before its positions go next. */
export const DWELL_MS = 1000;

/** Names the game the learner playing `learner` played as `moves`, for `ReviewScreen.game`. */
export const reviewedGame = (learner: string, moves: readonly Uci[]) =>
  `${learner} ${moves.join(' ')}`;

/** `game`'s review at its start: the summary, before any move, with nothing visited or tried. */
export const startReview = (game: string): ReviewScreen => ({
  game,
  ply: 0,
  visited: new Set(),
  tries: new Map(),
  shown: new Set(),
});

export function reviewReducer(state: ReviewScreen, action: ReviewAction): ReviewScreen {
  switch (action.type) {
    case 'review':
      return action.game === state.game ? state : startReview(action.game);
    case 'goto': {
      // The game's words are the learner's side, then one per move.
      const moves = state.game.split(' ').filter(Boolean).length - 1;
      const ply = Math.max(0, Math.min(action.ply, moves));
      if (ply === state.ply) return state;
      const { game, visited, tries, shown } = state;
      return {
        game,
        ply,
        visited: visited.has(ply) ? visited : new Set(visited).add(ply),
        tries,
        shown,
      };
    }
    case 'point':
      return action.uci === state.pointed ? state : { ...state, pointed: action.uci };
    case 'dwell':
      return action.ply !== state.ply || state.dwelt === action.ply
        ? state
        : { ...state, dwelt: action.ply };
    case 'retry':
      return state.board === 'retry' ? state : { ...state, board: 'retry' };
    case 'try': {
      // A try is played only on the board put back for one.
      if (state.board !== 'retry') return state;
      const tried = state.tries.get(state.ply) ?? [];
      return {
        ...state,
        tries: new Map(state.tries).set(state.ply, [...tried, action.uci]),
        board: 'try',
      };
    }
    case 'show answer':
      return {
        ...state,
        shown: state.shown.has(state.ply) ? state.shown : new Set(state.shown).add(state.ply),
        board: 'answer',
      };
  }
}
