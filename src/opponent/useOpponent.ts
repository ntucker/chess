import { createSetting, oneOf } from '@/settings/setting';

import {
  DEFAULT_OPPONENT_RATING,
  type Opponent,
  OPPONENT_ENGINES,
  type OpponentEngine,
} from './opponent';

const engineSetting = createSetting<OpponentEngine>('opponentEngine', oneOf(OPPONENT_ENGINES), 'maia');

/** Switches the engine that plays the opponent, and remembers it. */
export const setOpponentEngine = engineSetting.set;

/** The engine the learner chose to play against. */
export const useOpponentEngine = engineSetting.useValue;

/** Who the learner plays against: the chosen engine, at the opponent's rating. */
export function useOpponent(): Opponent {
  return { engine: useOpponentEngine(), rating: DEFAULT_OPPONENT_RATING };
}
