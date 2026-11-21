/**
 * The review page's one reducer: the move shown, the Stockfish row pointed
 * at and the plies visited (for Next moment). Everything else the page
 * shows is worked out from these, the moves and the analyses in the store
 * (`review.ts`, `order.ts`, `accuracy.ts`).
 */
import type { Uci } from '@/lesson/lesson';

export interface ReviewScreen {
  /** The position shown, `plies[ply]`; 0, before any move, is the summary. */
  readonly ply: number;
  /** The move of the Stockfish row pointed at, previewed on the board. */
  readonly pointed?: Uci;
  /** Every ply the board has shown, so Next moment skips the moments seen. */
  readonly visited: ReadonlySet<number>;
}

export type ReviewAction =
  /** Shows `plies[ply]`. */
  | { readonly type: 'goto'; readonly ply: number }
  /** Points at the row of `uci`, or at none. */
  | { readonly type: 'point'; readonly uci?: Uci };

/** The summary, before any move; nothing visited yet. */
export const initialReview: ReviewScreen = { ply: 0, visited: new Set() };

export function reviewReducer(state: ReviewScreen, action: ReviewAction): ReviewScreen {
  switch (action.type) {
    case 'goto': {
      if (action.ply === state.ply) return state;
      const { visited } = state;
      return {
        ply: action.ply,
        visited: visited.has(action.ply) ? visited : new Set(visited).add(action.ply),
      };
    }
    case 'point':
      return action.uci === state.pointed ? state : { ...state, pointed: action.uci };
  }
}
