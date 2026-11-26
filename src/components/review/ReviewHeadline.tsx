import { StatusHeadline } from '@/components/GameStatus';
import { type Color, shownMove } from '@/game/replay';
import { isFine, type ReviewMove } from '@/review/review';
import { answerOwner } from '@/review/retry';
import { summaryHeadline } from '@/review/summary';
import { qualityLooks } from '@/theme/moveQuality';

import type { ReviewView } from './reviewView';

/**
 * The review's headline, saying what `reviewHeadline` finds. A narrow page
 * draws it as one line under the header, which names the place.
 */
export function ReviewHeadline({
  eyebrow,
  learner,
  review,
}: {
  /** What the eyebrow names: "Review · Caro-Kann". */
  readonly eyebrow: string;
  readonly learner: Color;
  readonly review: ReviewView;
}) {
  return (
    <StatusHeadline
      eyebrow={eyebrow}
      eyebrowInHeader
      news="all"
      {...reviewHeadline(review, learner)}
    />
  );
}

/**
 * The headline: while moves still wait for Stockfish, at the start or at
 * one of them, that the reviews are coming in, with how far they've got;
 * at the start once they're in, the verdict on the learner's game
 * (`summaryHeadline`); at a move, its label; at a move whose search gave
 * up, a Try again.
 */
function reviewHeadline(
  {
    plies,
    ply,
    moves,
    failure,
    tryAgain,
    moments,
    accuracy,
    ...retried
  }: Pick<
    ReviewView,
    | 'plies'
    | 'ply'
    | 'moves'
    | 'failure'
    | 'tryAgain'
    | 'moment'
    | 'tryFailure'
    | 'searchTriesAgain'
    | 'moments'
    | 'accuracy'
  >,
  learner: Color,
) {
  const move = ply > 0 ? moves[ply - 1] : undefined;
  const waiting = moves.filter(({ status }) => status === 'waiting').length;
  const coming = {
    title: 'The reviews are coming in…',
    detail: `Checking each move: ${moves.length - waiting} of ${moves.length}.`,
  };
  if (!move) {
    if (waiting) return coming;
    return summaryHeadline({ plies, moves, moments, accuracy: accuracy[learner], learner });
  }
  const named = shownMove(plies[ply].move?.san, ply);
  if (move.status === 'waiting') return coming;
  if (move.status === 'failed') {
    const error = failure(ply);
    return {
      title: 'No verdict yet.',
      detail: named,
      failure: error && { who: 'Stockfish', error, onRetry: () => tryAgain(ply) },
    };
  }
  return (
    momentHeadline(retried, move, ply, named) ?? {
      title: `${qualityLooks[move.quality].name}.`,
      detail: named,
    }
  );
}

/**
 * The headline at a moment being retried: what the board shows in place of
 * the game's move, or the game's move with what to find while its answer is
 * hidden. Undefined where the move's own label says it all.
 */
function momentHeadline(
  {
    moment,
    tryFailure,
    searchTriesAgain,
  }: Pick<ReviewView, 'moment' | 'tryFailure' | 'searchTriesAgain'>,
  move: ReviewMove,
  ply: number,
  named: string,
) {
  const { board, tries, answer, hidden, canRetry } = moment;
  // "Find a better move than 7…Qxb2."; where the move left the guide but lost nothing, the guide's
  // move, though a best or good try that beats the game's move also passes (`passes`, review/retry.ts).
  const goal =
    answer?.guide && isFine(move.quality)
      ? `Find ${answerOwner(answer.quality)} move, or one stronger than ${named}.`
      : `Find a better move than ${named}.`;
  const latest = tries.at(-1);
  if (board === 'retry') return { title: 'Your move.', detail: goal };
  if (board === 'try' && latest) {
    const tried = shownMove(latest.san, ply);
    if (latest.status !== 'judged') {
      return latest.status === 'waiting'
        ? { title: 'Checking your try…', detail: tried }
        : {
            title: 'No verdict yet.',
            detail: tried,
            failure: tryFailure && {
              who: 'Stockfish',
              error: tryFailure,
              onRetry: searchTriesAgain,
            },
          };
    }
    return {
      title: `${qualityLooks[latest.quality].name}.`,
      detail: latest.passed
        ? `Found with ${tried}, on try ${tries.length}.`
        : `Your retry: ${tried}.`,
    };
  }
  if (board === 'answer' && answer) {
    const whose = answerOwner(answer.quality);
    return {
      title: `${qualityLooks[answer.quality].name}.`,
      detail: `${whose.charAt(0).toUpperCase()}${whose.slice(1)} move: ${shownMove(answer.san, ply)}.`,
    };
  }
  if (hidden && canRetry && move.quality) {
    return { title: `${qualityLooks[move.quality].name}.`, detail: goal };
  }
  return undefined;
}
