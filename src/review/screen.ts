/**
 * The review page's one reducer: the move shown, the Stockfish row pointed
 * at, the plies visited (for Next moment) and the ply the board has rested
 * on. Everything else the page shows is worked out from these, the moves
 * and the analyses in the store (`review.ts`, `order.ts`, `accuracy.ts`).
 */
import type { Uci } from '@/lesson/lesson';

export interface ReviewScreen {
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
  /** Shows `plies[ply]`. */
  | { readonly type: 'goto'; readonly ply: number }
  /** Points at the row of `uci`, or at none. */
  | { readonly type: 'point'; readonly uci?: Uci }
  /** The board has shown `ply` for `DWELL_MS`. */
  | { readonly type: 'dwell'; readonly ply: number };

/** How long the board rests on a move before its positions go next. */
export const DWELL_MS = 1000;

/** The summary, before any move; nothing visited yet. */
export const initialReview: ReviewScreen = { ply: 0, visited: new Set() };

export function reviewReducer(state: ReviewScreen, action: ReviewAction): ReviewScreen {
  switch (action.type) {
    case 'goto':
      if (action.ply === state.ply) return state;
      return { ply: action.ply, visited: new Set(state.visited).add(action.ply) };
    case 'point':
      return action.uci === state.pointed ? state : { ...state, pointed: action.uci };
    case 'dwell':
      return action.ply !== state.ply || state.dwelt === action.ply
        ? state
        : { ...state, dwelt: action.ply };
  }
}
