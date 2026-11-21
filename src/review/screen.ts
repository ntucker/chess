/**
 * The review page's one reducer: the move shown, the Stockfish row pointed
 * at, the plies visited (for Next moment) and the ply the board has rested
 * on. Everything else the page shows is worked out from these, the moves
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
}

export type ReviewAction =
  /** Starts the review of `game` afresh: another game on the same page. */
  | { readonly type: 'review'; readonly game: string }
  /** Shows `plies[ply]`. */
  | { readonly type: 'goto'; readonly ply: number }
  /** Points at the row of `uci`, or at none. */
  | { readonly type: 'point'; readonly uci?: Uci }
  /** The board has shown `ply` for `DWELL_MS`. */
  | { readonly type: 'dwell'; readonly ply: number };

/** How long the board rests on a move before its positions go next. */
export const DWELL_MS = 1000;

/** Names the game the learner playing `learner` played as `moves`, for `ReviewScreen.game`. */
export const reviewedGame = (learner: string, moves: readonly Uci[]) =>
  `${learner} ${moves.join(' ')}`;

/** `game`'s review at its start: the summary, before any move, with nothing visited. */
export const startReview = (game: string): ReviewScreen => ({ game, ply: 0, visited: new Set() });

export function reviewReducer(state: ReviewScreen, action: ReviewAction): ReviewScreen {
  switch (action.type) {
    case 'review':
      return action.game === state.game ? state : startReview(action.game);
    case 'goto': {
      if (action.ply === state.ply) return state;
      const { visited } = state;
      return {
        game: state.game,
        ply: action.ply,
        visited: visited.has(action.ply) ? visited : new Set(visited).add(action.ply),
      };
    }
    case 'point':
      return action.uci === state.pointed ? state : { ...state, pointed: action.uci };
    case 'dwell':
      return action.ply !== state.ply || state.dwelt === action.ply
        ? state
        : { ...state, dwelt: action.ply };
  }
}
