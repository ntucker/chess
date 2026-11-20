/**
 * The lesson screen's mode, as its part of the screen's reducer: Explore, or
 * Practice with whether the run is still clean. A clean run is what a
 * "passed" mark needs (tech plan section 6): the moves alone can't tell it,
 * since a slip taken back leaves only book moves behind.
 */
import type { GameState } from '@/game/game';
import type { Color, Ply } from '@/game/replay';

import type { LessonMode } from './guidance';
import type { Uci } from './lesson';

export type ModeState =
  | { readonly mode: Extract<LessonMode, 'explore'> }
  | {
      readonly mode: Extract<LessonMode, 'practice'>;
      /** No non-book move and no take-back since the learner's first move, up to `line`. */
      readonly clean: boolean;
      /**
       * The game's moves `clean` counts: the same array, so the screen sees
       * any change since and passes it on (`moved`), whoever made it.
       */
      readonly line: readonly Uci[];
    };

export const initialMode: ModeState = { mode: 'explore' };

/**
 * Whether none of the first `count` moves from `plies` is `side`'s. With the
 * moves up to the board's, a move played there starts a run.
 */
export const beforeSideMoves = (plies: readonly Ply[], side: Color, count: number) =>
  plies.slice(0, count).every(({ turn }) => turn !== side);

/**
 * Whether the opponent plays its own move in `game`'s shown position, rather
 * than the learner picking it. Never with auto play off, nor at the start,
 * where the first move picks the opening. Nor in Explore on an earlier move
 * than the latest: stepped back, the learner can try one reply and see where
 * it leads, and auto play answers their moves after it.
 */
export const opponentPlays = (mode: LessonMode, auto: boolean, { moves, ply }: GameState) =>
  auto && ply > 0 && (mode === 'practice' || ply === moves.length);

/** Who played a move of the line and, for the learner's, whether the guide recommends it. */
export type MoveKind = 'opponent' | 'book' | 'slip';

/** Each of the moves that led to `plies`' last position, as a run sees it. */
export const moveKinds = (
  plies: readonly Ply[],
  side: Color,
  book: readonly boolean[],
): MoveKind[] =>
  plies.slice(0, -1).map(({ turn }, n) => (turn !== side ? 'opponent' : book[n] ? 'book' : 'slip'));

export type ModeAction =
  | {
      readonly type: 'modeChosen';
      readonly mode: LessonMode;
      /** The game's moves when the learner chose. */
      readonly line: readonly Uci[];
      /** Each move of `line` (`moveKinds`). */
      readonly kinds: readonly MoveKind[];
    }
  | {
      /** The game's moves changed from `from`, the run's `line`, to `line`. */
      readonly type: 'moved';
      readonly from: readonly Uci[];
      readonly line: readonly Uci[];
      /** Each move of `line` (`moveKinds`). */
      readonly kinds: readonly MoveKind[];
    };

/**
 * The mode after `action`. Entering Practice on a line with no move of the
 * learner's starts a clean run; entering it later can't pass, since the moves
 * before were shown with every hint (wherever the board is: stepping back,
 * choosing Practice and stepping on would otherwise pass unplayed). A run
 * stays clean until the learner plays a non-book move or takes a move back,
 * and starts again at their first move.
 *
 * The game is held above the lesson (`useGame`'s store), so the run can't
 * change in the game's own transition: it keeps the line it counted, and
 * compares it with the game's moves once they change.
 */
export function modeReducer(state: ModeState, action: ModeAction): ModeState {
  switch (action.type) {
    case 'modeChosen':
      if (action.mode === state.mode) return state;
      return action.mode === 'explore'
        ? initialMode
        : { mode: 'practice', clean: untouched(action.kinds), line: action.line };
    case 'moved':
      if (state.mode === 'explore' || state.line !== action.from) return state;
      return { mode: 'practice', clean: cleanAfter(state.clean, action), line: action.line };
  }
}

/**
 * Whether the run is clean once the game's moves went from `from` to `line`,
 * by any number of moves taken back and played. A line with no move of the
 * learner's is clean. A change that comes before the learner's first move
 * starts the run again; any later one keeps it only if it takes nothing back.
 * Either way, every move it played of the learner's must be a book move.
 */
function cleanAfter(
  clean: boolean,
  { from, line, kinds }: Extract<ModeAction, { type: 'moved' }>,
): boolean {
  if (untouched(kinds)) return true;
  const kept = sharedMoves(from, line);
  const takenBack = kept < from.length;
  // A new line's last move was just played (`GameState.moves`), even when
  // it is the move that was there before.
  const playedFrom = Math.min(kept, line.length - 1);
  if (kinds.slice(playedFrom).includes('slip')) return false;
  // Played at or before the learner's first move, as `beforeSideMoves` tells them.
  return untouched(kinds.slice(0, playedFrom)) || (clean && !takenBack);
}

/** No move is the learner's. */
const untouched = (kinds: readonly MoveKind[]) => kinds.every((kind) => kind === 'opponent');

/** How many moves `a` and `b` share from the start. */
function sharedMoves(a: readonly Uci[], b: readonly Uci[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}
