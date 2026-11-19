/**
 * The lesson screen's one reducer: the mode (`practice.ts`), what the board
 * shows beyond the game (`peek.ts`), and whether the candidate list shows its
 * rare rows. The game itself is `useGame`'s.
 */
import type { PositionKey } from './lesson';
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
  readonly rareShown?: PositionKey;
}

/** The learner shows or hides the rare rows of `key`'s candidate list. */
interface RareAction {
  readonly type: 'rare';
  readonly key: PositionKey;
  readonly shown: boolean;
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
    const rareShown = action.shown ? action.key : undefined;
    return rareShown === state.rareShown ? state : { ...state, rareShown };
  }
  const peek = peekReducer(state.peek, action);
  const rareShown =
    action.type === 'board' && state.rareShown !== action.key ? undefined : state.rareShown;
  return peek === state.peek && rareShown === state.rareShown
    ? state
    : { ...state, peek, rareShown };
}
