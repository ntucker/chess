/**
 * The lesson screen's mode, as its part of the screen's reducer: Explore, or
 * Practice with whether the run is still clean. A clean run is what a
 * "passed" mark needs (tech plan section 6): the moves alone can't tell it,
 * since a slip taken back leaves only book moves behind.
 */
import type { Color, Ply } from '@/game/replay';

import type { LessonMode } from './guidance';

export type ModeState =
  | { readonly mode: 'explore' }
  | {
      readonly mode: 'practice';
      /** No non-book move and no take-back since the learner's first move. */
      readonly clean: boolean;
    };

export const initialMode: ModeState = { mode: 'explore' };

/**
 * Whether none of the first `count` moves from `plies` is `side`'s. With the
 * moves up to the board's, a move played there starts a run (`PlayedMove`).
 */
export const beforeSideMoves = (plies: readonly Ply[], side: Color, count: number) =>
  plies.slice(0, count).every(({ turn }) => turn !== side);

/** Facts about a move the learner played, on the lesson screen. */
export interface PlayedMove {
  /** The learner's own side moved, rather than picking the opponent's move. */
  readonly learner: boolean;
  /** The guide recommends it: a book move. */
  readonly book: boolean;
  /** No move of the learner's comes before it, so a run starts here (`beforeSideMoves`). */
  readonly first: boolean;
  /** It was played from an earlier position than the latest, dropping the moves after. */
  readonly replaces: boolean;
}

export type ModeAction =
  | {
      readonly type: 'modeChosen';
      readonly mode: LessonMode;
      /**
       * The line holds no move of the learner's yet, wherever the board is:
       * stepping back over moves seen with hints, choosing Practice and
       * stepping on again would otherwise pass unplayed.
       */
      readonly untouched: boolean;
    }
  | ({ readonly type: 'played' } & PlayedMove);

/**
 * The mode after `action`. Entering Practice on a line with no move of the
 * learner's starts a clean run; entering it later can't pass, since the moves
 * before were shown with every hint. A run stays clean until the learner
 * plays a non-book move or takes a move back, and starts again at their
 * first move.
 */
export function modeReducer(state: ModeState, action: ModeAction): ModeState {
  switch (action.type) {
    case 'modeChosen':
      if (action.mode === state.mode) return state;
      return action.mode === 'explore'
        ? initialMode
        : { mode: 'practice', clean: action.untouched };
    case 'played': {
      if (state.mode === 'explore') return state;
      const slip = action.learner && !action.book;
      return {
        mode: 'practice',
        clean: !slip && (action.first || (state.clean && !action.replaces)),
      };
    }
  }
}
