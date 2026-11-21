import { MAIA_RATINGS, type MaiaRating } from '@/maia/ratings';
import { FULL_STOCKFISH_MB } from '@/stockfish/fullFiles';

/**
 * Who the learner plays against, as one ladder of difficulty: Maia at a
 * rating, 1100 to 1900, playing the way people of that rating do, then
 * Stockfish above them all, playing the move it judges best: lite, which
 * ships with the app, and full Stockfish, its large network, which
 * downloads once when first picked (src/stockfish/full.ts).
 */
export type Opponent = MaiaRating | StockfishOpponent;

/** The Stockfish steps at the top of the ladder, easiest first. */
const STOCKFISH_OPPONENTS = ['stockfish', 'stockfish-full'] as const;
type StockfishOpponent = (typeof STOCKFISH_OPPONENTS)[number];

/** Every opponent, easiest first. */
export const OPPONENTS: readonly Opponent[] = [...MAIA_RATINGS, ...STOCKFISH_OPPONENTS];

/** Whether `opponent` is Stockfish, which plays its best move rather than a rating's. */
export const isStockfish = (opponent: Opponent): opponent is StockfishOpponent =>
  (STOCKFISH_OPPONENTS as readonly Opponent[]).includes(opponent);

/** The landmarks on the ladder, named for who plays there. */
const PRESETS: Partial<Record<Opponent, string>> = {
  1100: 'Beginner',
  1500: 'Club',
  1900: 'Advanced',
  stockfish: 'Best move',
  'stockfish-full': 'Full strength',
};

/** The steps the learner picks from, easiest first: the landmarks. */
export const OPPONENT_PRESETS: readonly Opponent[] = OPPONENTS.filter(
  (opponent) => PRESETS[opponent] !== undefined,
);

/**
 * How `opponent` is shown: its name, its step on the difficulty ladder, the
 * words that lead up to that step on its name plate ("Plays like a" 1500),
 * a landmark's name if it is one, and one sentence on how it plays.
 */
export function describeOpponent(opponent: Opponent) {
  const preset = PRESETS[opponent];
  if (!isStockfish(opponent))
    return {
      name: 'Maia',
      level: String(opponent),
      lead: 'Plays like a',
      preset,
      style: `Maia plays the way people rated about ${opponent} do.`,
    };
  return { name: 'Stockfish', lead: 'Plays like', preset, ...STOCKFISH[opponent] };
}

/** How each Stockfish step differs from the other. */
const STOCKFISH: Record<StockfishOpponent, { level: string; style: string }> = {
  stockfish: { level: 'Stockfish', style: 'Stockfish plays the move it judges best.' },
  'stockfish-full': {
    level: 'Full Stockfish',
    style: `Stockfish's full network, stronger still: a one-time ${FULL_STOCKFISH_MB} MB download.`,
  },
};
