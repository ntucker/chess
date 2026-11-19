/**
 * The lesson screen's one reducer: the mode (`practice.ts`) and what the
 * board shows beyond the game (`peek.ts`). The game itself is `useGame`'s.
 */
import { type Peek, type PeekAction, peekReducer } from './peek';
import { initialMode, type ModeAction, modeReducer, type ModeState } from './practice';

export interface ScreenState {
  readonly mode: ModeState;
  readonly peek?: Peek;
}

export type ScreenAction = ModeAction | PeekAction;

export const initialScreen: ScreenState = { mode: initialMode };

/** Each action goes to the part it is about; a part it leaves alone keeps the state. */
export function screenReducer(state: ScreenState, action: ScreenAction): ScreenState {
  if (action.type === 'modeChosen' || action.type === 'played') {
    const mode = modeReducer(state.mode, action);
    return mode === state.mode ? state : { ...state, mode };
  }
  const peek = peekReducer(state.peek, action);
  return peek === state.peek ? state : { ...state, peek };
}
