/**
 * What the review's headline says at the start once every move is checked:
 * the verdict on the learner's game, over how it went. Pure, like the rest
 * of `src/review/`.
 */
import { resultVerdict } from '@/game/ending';
import { analyze, type Color, type Ply } from '@/game/replay';
import { plural } from '@/words';

import { accuracyWords, LEAST_COUNTED, verdictLine } from './accuracy';
import { resigner } from './resigner';
import type { ReviewMove } from './review';

interface SummaryInput {
  readonly plies: readonly Ply[];
  readonly moves: readonly ReviewMove[];
  /** The learner's moments. */
  readonly moments: readonly number[];
  /** The learner's accuracy (`gameAccuracy`). */
  readonly accuracy: number | 'brief' | undefined;
  readonly learner: Color;
}

/**
 * The verdict on the learner's accuracy (`verdictLine`) over how the game
 * went and how many moments it has. Example: "Warm applause." over "You won
 * in 34 moves. 3 moments to replay.", with the accuracy in its tooltip. With
 * too few of their moves judged, "A brief appearance.", with why there's no
 * verdict in its tooltip.
 */
export function summaryHeadline({ plies, moves, moments, accuracy, learner }: SummaryInput) {
  const game = gameLength(plies, learner);
  if (accuracy === 'brief') {
    return {
      title: 'A brief appearance.',
      titleTip: `No verdict or accuracy: fewer than ${LEAST_COUNTED} of your moves were judged, too few to count.`,
      detail: game,
    };
  }
  const failed = moves.filter(({ status }) => status === 'failed').length;
  const replay = moments.length
    ? `${plural(moments.length, 'moment')} to replay.`
    : 'No moments to replay.';
  const lost = failed ? ` ${plural(failed, 'move')} couldn't be checked.` : '';
  if (accuracy === undefined)
    return { title: 'The reviews are in.', detail: `${game} ${replay}${lost}` };
  return {
    title: verdictLine(accuracy),
    // The number behind the verdict: the only place a phone shows the learner's.
    titleTip: `${accuracyWords('Your', accuracy)}.`,
    detail: `${game} ${replay}${lost}`,
  };
}

/**
 * How long the game went, and how it ended for the learner: "You won in 34
 * moves.", "Drawn in 12 moves.", or, reviewed before it ended, "You lost by
 * resignation in 9 moves."
 */
function gameLength(plies: readonly Ply[], learner: Color) {
  const length = plural(Math.ceil((plies.length - 1) / 2), 'move');
  const last = analyze(plies.at(-1)!);
  if (!last.result) {
    return `You ${resigner(last) === learner ? 'lost' : 'won'} by resignation in ${length}.`;
  }
  const { mood } = resultVerdict(last.result, learner);
  return mood === 'drawn' ? `Drawn in ${length}.` : `You ${mood} in ${length}.`;
}
