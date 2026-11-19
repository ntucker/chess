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

/** How `opponent` is shown: its name, a few words for its name plate, and one sentence on how it plays. */
export function describeOpponent({ engine, rating }: Opponent) {
  return engine === 'maia'
    ? {
        name: 'Maia',
        tagline: `Plays like a ${rating}`,
        style: `Maia plays the way people rated about ${rating} do.`,
      }
    : {
        name: 'Stockfish',
        tagline: 'Plays its best move',
        style: 'Stockfish plays the move it judges best.',
      };
}
