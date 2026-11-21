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
 * a landmark's name if it is one, one sentence on how it plays, and its
 * rating: Maia's is the one it was trained on; Stockfish's is estimated
 * (`estimated`), on the same scale.
 */
export function describeOpponent(opponent: Opponent) {
  const preset = PRESETS[opponent];
  if (!isStockfish(opponent))
    return {
      name: 'Maia',
      level: String(opponent),
      lead: 'Plays like a',
      preset,
      rating: opponent as number,
      estimated: false,
      style: `Maia plays the way people rated about ${opponent} do.`,
    };
  return { name: 'Stockfish', lead: 'Plays like', preset, estimated: true, ...STOCKFISH[opponent] };
}

/**
 * How each Stockfish step differs from the other, with its rating estimated
 * on Maia's (human) scale, rounded to 100. Measured 2026-11-21 with the app's
 * own searches (lite: 2M nodes; full: 1M nodes): lite beat Stockfish's
 * `UCI_Elo 3190` (engine-list scale, 60+0.6s) 10 of 11 games, so about 3400
 * on that scale once wasm's slower clock is allowed for; full scored 20.5 of
 * 34 against lite (about +70). Engine-list ratings run far above human ones
 * this high; the common fit human ≈ 0.7 × engine + 840 gives about 3200 and
 * 3300. Treat them as rough: no person plays either.
 */
const STOCKFISH: Record<StockfishOpponent, { level: string; style: string; rating: number }> = {
  stockfish: {
    level: 'Stockfish',
    rating: 3200,
    style: 'Stockfish plays the move it judges best.',
  },
  'stockfish-full': {
    level: 'Full Stockfish',
    rating: 3300,
    style: `Stockfish's full network, stronger still: a one-time ${FULL_STOCKFISH_MB} MB download.`,
  },
};
