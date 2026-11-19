import { type MaiaRating, MODELS } from '@/maia/models';

/**
 * Who the learner plays against, as one ladder of difficulty: Maia at a
 * rating, 1100 to 1900, playing the way people of that rating do, and
 * Stockfish above them all, playing the move it judges best. The rating also
 * picks the lichess rating band in lessons.
 */
export type Opponent = MaiaRating | 'stockfish';

const MAIA_RATINGS = Object.keys(MODELS).map(Number) as MaiaRating[];

/** Every opponent, easiest first. */
export const OPPONENTS: readonly Opponent[] = [...MAIA_RATINGS, 'stockfish'];

/** The opponents the footnote offers: Beginner, Club and Advanced Maia, then Stockfish. */
export const OPPONENT_PRESETS = [1100, 1500, 1900, 'stockfish'] as const satisfies readonly Opponent[];

/** Who the learner plays until they choose: Maia at club level. */
export const DEFAULT_OPPONENT: Opponent = 1500;

/**
 * How `opponent` is shown: its name, a few words for its name plate, and one
 * sentence on how it plays.
 */
export function describeOpponent(opponent: Opponent) {
  return opponent === 'stockfish'
    ? {
        name: 'Stockfish',
        tagline: 'Plays its best move',
        style: 'Stockfish plays the move it judges best.',
      }
    : {
        name: 'Maia',
        tagline: `Plays like a ${opponent}`,
        style: `Maia plays the way people rated about ${opponent} do.`,
      };
}
