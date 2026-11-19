import type { MaiaRating } from '@/maia/models';

/**
 * The engines that can play the opponent. Maia plays the way people of the
 * opponent's rating do; Stockfish plays the move it judges best.
 */
export const OPPONENT_ENGINES = ['maia', 'stockfish'] as const;

export type OpponentEngine = (typeof OPPONENT_ENGINES)[number];

/** Who the learner plays against. */
export interface Opponent {
  readonly engine: OpponentEngine;
  /**
   * How strong the opponent is, 1100 to 1900. It picks Maia's network.
   * Stockfish plays its best move at every rating: weakened, it blunders at
   * random rather than the way people do, which is what Maia is for.
   */
  readonly rating: MaiaRating;
}

/** The opponent's rating until the learner can pick one. */
export const DEFAULT_OPPONENT_RATING: MaiaRating = 1500;

export const OPPONENT_NAMES: Record<OpponentEngine, string> = {
  maia: 'Maia',
  stockfish: 'Stockfish',
};

/** A few words on how `opponent` plays, for its name plate. */
export function opponentTagline({ engine, rating }: Opponent): string {
  return engine === 'maia' ? `Plays like a ${rating}` : 'Full strength';
}

/** One sentence on how `opponent` plays. */
export function opponentStyle({ engine, rating }: Opponent): string {
  return engine === 'maia'
    ? `Maia plays the way people rated about ${rating} do.`
    : 'Stockfish plays the move it judges best, at full strength.';
}
