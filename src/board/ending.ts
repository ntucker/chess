/**
 * How a finished game ended for the learner, as JSON for the board's web view
 * (Board.tsx) and the card over it (EndingCard.tsx). Only types are imported,
 * so the board can bundle it.
 */
import type { Color } from 'chessops/types';

import type { GameResult } from '@/game/replay';

/** The learner's side of the result: they mated, were mated, or neither won. */
export type Mood = 'won' | 'lost' | 'drawn';

export interface Ending {
  readonly mood: Mood;
  /** The side that mated; none for a draw. */
  readonly winner?: Color;
  readonly reason: GameResult['reason'];
}

/** How `result` ended for the learner playing `learner`; none while the game goes on. */
export function gameEnding(result: GameResult | undefined, learner: Color): Ending | undefined {
  if (!result) return undefined;
  const { winner, reason } = result;
  const mood = !winner ? 'drawn' : winner === learner ? 'won' : 'lost';
  return winner ? { mood, winner, reason } : { mood, reason };
}
