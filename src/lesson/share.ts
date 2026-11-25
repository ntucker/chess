/**
 * A move's share of the games at its position: one definition for every
 * caller (docs/plans/opportunities.md, Shape). Pure, and on game counts, so
 * a caller holding raw lichess explorer counts uses it as a lesson does.
 */
import type { LessonMove, LessonPosition } from './lesson';

/** A rating band: an index into `Lesson.popularity.ratingBands`, or every band summed. */
export type Band = number | 'all';

/** The games a move was played in, in `band`, if the guide counts them. */
export const moveGames = ({ games }: LessonMove, band: Band) => countIn(games, band);

/** The games that reached a position, in `band`, if measured. */
export const positionGames = ({ games }: LessonPosition, band: Band) => countIn(games, band);

const countIn = (games: readonly number[] | undefined, band: Band) =>
  band === 'all' ? games?.reduce((sum, n) => sum + n, 0) : games?.[band];

/**
 * A move's share, from 0 to 1: its games over the position's own total where
 * that is measured, else over the sum of the listed moves' games (older
 * data). Undefined for a move without counts, or where nothing was counted.
 */
export function moveShare(
  games: number | undefined,
  listed: number,
  total?: number,
): number | undefined {
  const of = total ?? listed;
  return games === undefined || of <= 0 ? undefined : games / of;
}

/**
 * Each of `entry`'s moves' share in `band` (`moveShare`), by move: undefined
 * for a move without counts there, and for every move without a band.
 */
export function bandShare(entry: LessonPosition, band: number | undefined) {
  const count = (move: LessonMove) => (band === undefined ? undefined : moveGames(move, band));
  const listed = entry.moves.reduce((sum, move) => sum + (count(move) ?? 0), 0);
  const total = band === undefined ? undefined : positionGames(entry, band);
  return (move: LessonMove) => moveShare(count(move), listed, total);
}
