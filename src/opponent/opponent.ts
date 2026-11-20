import { MAIA_RATINGS, type MaiaRating } from '@/maia/ratings';

/**
 * Who the learner plays against, as one ladder of difficulty: Maia at a
 * rating, 1100 to 1900, playing the way people of that rating do, and
 * Stockfish above them all, playing the move it judges best.
 */
export type Opponent = MaiaRating | 'stockfish';

/** Every opponent, easiest first. */
export const OPPONENTS: readonly Opponent[] = [...MAIA_RATINGS, 'stockfish'];

/** The steps the learner picks from: Beginner, Club and Advanced Maia, then Stockfish. */
export const OPPONENT_PRESETS: readonly Opponent[] = [1100, 1500, 1900, 'stockfish'];

/** The landmarks on the ladder, named for who plays there. */
const PRESETS: Partial<Record<Opponent, string>> = {
  1100: 'Beginner',
  1500: 'Club',
  1900: 'Advanced',
  stockfish: 'Best move',
};

/**
 * How `opponent` is shown: its name, its step on the difficulty ladder, the
 * words that lead up to that step on its name plate ("Plays like a" 1500),
 * a landmark's name if it is one, and one sentence on how it plays.
 */
export function describeOpponent(opponent: Opponent) {
  const preset = PRESETS[opponent];
  return opponent === 'stockfish'
    ? {
        name: 'Stockfish',
        level: 'Stockfish',
        lead: 'Plays like',
        preset,
        style: 'Stockfish plays the move it judges best.',
      }
    : {
        name: 'Maia',
        level: String(opponent),
        lead: 'Plays like a',
        preset,
        style: `Maia plays the way people rated about ${opponent} do.`,
      };
}
