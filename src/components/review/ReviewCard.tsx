import { lostPercent } from '@/analysis/quality';
import type { Color } from '@/game/replay';
import type { LessonId } from '@/resources/lesson';
import { playOnHref } from '@/review/address';
import { compareMove } from '@/review/comparison';
import type { ReviewMove } from '@/review/review';

import { MoveCard } from './MoveCard';
import type { ReviewView } from './reviewView';
import { ReviewTally } from './Tally';

/** What the review says of the move shown: its move card, or at the start each side's tally. */
export function ReviewCard({
  learner,
  review,
  lesson,
}: {
  readonly learner: Color;
  readonly review: ReviewView;
  /** The lesson the game was played in, if any: "Play on from here" opens its page. */
  readonly lesson?: LessonId;
}) {
  const { plies, ply, moves, analyses, pointed, moment, point } = review;
  const move = ply > 0 ? moves[ply - 1] : undefined;
  if (!move) return <ReviewTally tally={review.tally} learner={learner} />;
  return (
    <MoveCard
      whose={move.mover === learner ? 'yours' : 'theirs'}
      // A book move is the guide's: no other moves, and no changes beside its badge.
      comparison={compareMove(plies, move.status === 'book' ? [] : analyses, ply, learner)}
      quality={move.quality}
      qualityDetail={lossDetail(move)}
      hidden={moment.hidden ? (moment.answer ? 'until retry' : 'until judged') : undefined}
      tries={moment.tries}
      guide={moment.revealed ? moment.answer : undefined}
      playOn={moment.playOn && playOnHref(moment.playOn, learner, lesson)}
      pointed={pointed}
      onPoint={point}
    />
  );
}

/** How much of the mover's winning chances a judged move gave away, when it gave any: "Here: 26%." */
function lossDetail(move: ReviewMove) {
  if (move.status !== 'judged') return undefined;
  const lost = lostPercent(move.before - move.after);
  return lost && `Here: ${lost}.`;
}
