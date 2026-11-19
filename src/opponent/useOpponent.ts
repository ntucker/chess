import { createSetting, oneOf } from '@/settings/setting';

import { DEFAULT_OPPONENT, type Opponent, OPPONENTS } from './opponent';

const setting = createSetting<Opponent>('opponentStrength', oneOf(OPPONENTS), DEFAULT_OPPONENT);

/** Switches who the learner plays against, and remembers it. */
export const setOpponent = setting.set;

/** Who the learner chose to play against. */
export const useOpponent = setting.useValue;
