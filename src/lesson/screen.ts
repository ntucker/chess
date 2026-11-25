/**
 * The lesson screen's one reducer: the mode (`practice.ts`), what the board
 * shows beyond the game (`peek.ts`), and whether the candidate list shows its
 * rare rows. The last two belong to a position and end when the board moves
 * on. The game itself is `useGame`'s.
 */
import type { PositionKey, Uci } from './lesson';
import { type Peek, type PeekAction, peekReducer } from './peek';
import { initialMode, type ModeAction, modeReducer, type ModeState } from './practice';

export interface ScreenState {
  readonly mode: ModeState;
  readonly peek?: Peek;
  /**
   * The position whose candidate list shows its rare rows (`Candidate.rare`).
   * Every other position's list hides them, and the board moving on hides
   * them again, so each list starts hidden.
   */
  readonly rareKey?: PositionKey;
}

/**
 * The learner shows or hides the rare rows of `key`'s candidate list, whose
 * moves are `rows`. Hiding ends a preview from one of those rows, as if the
 * learner had left it; a dragged piece's preview and the card's note stay.
 */
interface RareAction {
  readonly type: 'rare';
  readonly key: PositionKey;
  readonly shown: boolean;
  readonly rows: readonly Uci[];
}

/** The board shows `key`: a peek or shown rare rows from another position end. */
interface BoardAction {
  readonly type: 'board';
  readonly key: PositionKey;
}

export type ScreenAction = ModeAction | PeekAction | RareAction | BoardAction;

export const initialScreen: ScreenState = { mode: initialMode };

/** Each action goes to the part it is about; a part it leaves alone keeps the state. */
export function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
  if (action.type === 'modeChosen' || action.type === 'moved') {
    const mode = modeReducer(state.mode, action);
    return mode === state.mode ? state : { ...state, mode };
  }
  if (action.type === 'rare') {
    const rareKey = action.shown ? action.key : undefined;
    const pointer = state.peek?.candidate;
    const hidden = !action.shown && pointer?.at === 'row' && action.rows.includes(pointer.uci);
    const peek = hidden
      ? peekReducer(state.peek, { type: 'candidate', key: action.key })
      : state.peek;
    return rareKey === state.rareKey && peek === state.peek ? state : { ...state, peek, rareKey };
  }
  if (action.type === 'board') {
    const peek = state.peek?.key === action.key ? state.peek : undefined;
    const rareKey = state.rareKey === action.key ? state.rareKey : undefined;
    return peek === state.peek && rareKey === state.rareKey ? state : { ...state, peek, rareKey };
  }
  const peek = peekReducer(state.peek, action);
  return peek === state.peek ? state : { ...state, peek };
}
