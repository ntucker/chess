/**
 * The lesson screen's one reducer: the mode (`practice.ts`), what the board
 * shows beyond the game (`peek.ts`), and whether the candidate list shows its
 * rare rows. The game itself is `useGame`'s.
 */
import type { PositionKey, Uci } from './lesson';
import { type Peek, type PeekAction, peekReducer } from './peek';
import { initialMode, type ModeAction, modeReducer, type ModeState } from './practice';

export interface ScreenState {
  readonly mode: ModeState;
  readonly peek?: Peek;
  /**
   * The position whose candidate list shows its rare rows (`Candidate.rare`).
   * Every other position's list hides them, and the board moving on (the
   * peek's `board` action) hides them again, so each list starts hidden.
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

export type ScreenAction = ModeAction | PeekAction | RareAction;

export const initialScreen: ScreenState = { mode: initialMode };

/** Each action goes to the part it is about; a part it leaves alone keeps the state. */
export function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
  if (action.type === 'modeChosen' || action.type === 'played') {
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
  const peek = peekReducer(state.peek, action);
  const rareKey =
    action.type === 'board' && state.rareKey !== action.key ? undefined : state.rareKey;
  return peek === state.peek && rareKey === state.rareKey ? state : { ...state, peek, rareKey };
}
