import { type Color, replay } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
import { lessonHref } from '@/lesson/openings';
import type { LessonId } from '@/resources/lesson';

/**
 * The review's address as the route reads it, every part as the URL has it,
 * unchecked: `/review?moves=e2e4 c7c6&side=black&lesson=caro-kann`.
 * `reviewHref` writes it and `addressMoves` reads its moves back.
 */
export interface ReviewAddress {
  /** The game's moves (UCI) from the start, separated by spaces. */
  readonly moves?: string;
  /** The learner's side. */
  readonly side?: string;
  /** The lesson the game was played in, if any. */
  readonly lesson?: string;
}

/** The review of a game: its moves from the start, the learner's side, and its lesson, if any. */
export const reviewHref = (moves: readonly Uci[], side: Color, lesson?: LessonId) =>
  ({
    pathname: '/review',
    params: { moves: moves.join(' '), side, ...(lesson && { lesson }) },
  }) as const;

/**
 * The moves an address names, as `reviewHref` or `playOnHref` wrote them, up
 * to the first that isn't legal: `?moves=e2e4 e2e5 e7e5` reads as 1.e4.
 */
export function addressMoves(moves = ''): Uci[] {
  if (!moves) return [];
  const line = moves.split(' ');
  return line.slice(0, replay(line).length - 1);
}

/**
 * "Play on from here": the game's page, starting a game that has played
 * `moves`. A lesson's page plays from its own side (`?moves=`); the free-game
 * page takes the learner's side too (`/play?moves=…&side=black`).
 */
export const playOnHref = (moves: readonly Uci[], side: Color, lesson?: LessonId) =>
  lesson
    ? ({ pathname: lessonHref(lesson), params: { moves: moves.join(' ') } } as const)
    : ({ pathname: '/play', params: { moves: moves.join(' '), side } } as const);
