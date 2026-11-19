import { MAIA_RATINGS, type MaiaRating } from '@/maia/ratings';

/**
 * Who the learner plays against, as one ladder of difficulty: Maia at a
 * rating, 1100 to 1900, playing the way people of that rating do, and
 * Stockfish above them all, playing the move it judges best.
 */
export type Opponent = MaiaRating | 'stockfish';

/** Every opponent, easiest first. */
export const OPPONENTS: readonly Opponent[] = [...MAIA_RATINGS, 'stockfish'];

/** The opponents the footnote offers: Beginner, Club and Advanced Maia, then Stockfish. */
export const OPPONENT_PRESETS: readonly Opponent[] = [1100, 1500, 1900, 'stockfish'];

/**
 * How `opponent` is shown: its name, its step on the difficulty ladder, a few
 * words for its name plate, and one sentence on how it plays.
 */
export function describeOpponent(opponent: Opponent) {
  return opponent === 'stockfish'
    ? {
        name: 'Stockfish',
        level: 'Stockfish',
        tagline: 'Plays its best move',
        style: 'Stockfish plays the move it judges best.',
      }
    : {
        name: 'Maia',
        level: String(opponent),
        tagline: `Plays like a ${opponent}`,
        style: `Maia plays the way people rated about ${opponent} do.`,
      };
}
