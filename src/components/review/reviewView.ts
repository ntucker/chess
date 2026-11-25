import type { Review } from '@/review/useReview';

import type { GraphView } from './ReviewGraph';

/** What the panel shows of a review (`useReview`); any analyses will do, so the gallery can make them up. */
export type ReviewView = GraphView &
  Pick<
    Review,
    | 'pointed'
    | 'nextMoment'
    | 'point'
    | 'tryAgain'
    | 'failure'
    | 'moment'
    | 'retry'
    | 'showAnswer'
    | 'tryFailure'
    | 'searchTriesAgain'
    | 'tally'
    | 'accuracy'
  >;

/** The review's game as a scoresheet shows it, each move marked with its label or its state. */
export function reviewScoresheet({
  plies,
  moves,
  ply,
  goto,
}: Pick<ReviewView, 'plies' | 'moves' | 'ply' | 'goto'>) {
  return {
    plies,
    marks: moves.map((move) => move.quality ?? move.status),
    ply,
    onGoto: goto,
  };
}
