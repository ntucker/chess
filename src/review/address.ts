import type { Color } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';
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

/** The moves an address names, as `reviewHref` wrote them. */
export const addressMoves = (moves = ''): Uci[] => (moves ? moves.split(' ') : []);
