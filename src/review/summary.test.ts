import { describe, expect, it } from '@jest/globals';

import { replay } from '@/game/replay';
import { uciLine } from '@/lesson/lesson.fixture';

import { failedMove, judgedMove } from './review.fixture';
import { summaryHeadline } from './summary';

// Fool's mate: 1.f3 e5 2.g4 Qh4#, Black mating.
const MATE = replay(uciLine('f3', 'e5', 'g4', 'Qh4#'));
const moves = MATE.slice(1).map((_, ply) => judgedMove(ply, 'best'));

describe('summaryHeadline', () => {
  it('gives the verdict over how the game ended for the learner, and its moments', () => {
    expect(
      summaryHeadline({ plies: MATE, moves, moments: [2, 4], accuracy: 92, learner: 'black' }),
    ).toEqual({ title: 'Standing ovation.', detail: 'You won in 2 moves. 2 moments to replay.' });
    expect(
      summaryHeadline({ plies: MATE, moves, moments: [], accuracy: 58, learner: 'white' }),
    ).toEqual({ title: 'A rough night.', detail: 'You lost in 2 moves. No moments to replay.' });
  });

  it('counts an unfinished game in moves, and the moves that could not be checked', () => {
    const plies = MATE.slice(0, 4);
    expect(
      summaryHeadline({
        plies,
        moves: [judgedMove(0, 'best'), failedMove(1), judgedMove(2, 'good')],
        moments: [1],
        accuracy: undefined,
        learner: 'white',
      }),
    ).toEqual({
      title: 'The reviews are in.',
      detail: "2 moves. 1 moment to replay. 1 move couldn't be checked.",
    });
  });

  it('gives no verdict on too few judged moves, and says why in a tooltip', () => {
    expect(
      summaryHeadline({ plies: MATE, moves, moments: [], accuracy: 'brief', learner: 'black' }),
    ).toEqual({
      title: 'A brief appearance.',
      titleTip: 'No verdict or accuracy: fewer than 8 of your moves were judged, too few to count.',
      detail: 'You won in 2 moves.',
    });
  });
});
