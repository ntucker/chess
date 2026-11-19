/**
 * Who answers the learner in a lesson: the guide while it has moves, then
 * the opponent engine. The one place that rule lives.
 */
import type { GameOpponent } from '@/game/game';
import type { Opponent } from '@/opponent/opponent';

import type { Lesson, Uci } from './lesson';
import { type Candidate, candidates, lineKeys, opponentBand } from './select';

/**
 * The guide's reply: the most common candidate. `candidates` lists them most
 * common first, with ties and unmeasured moves in the file's order, so this
 * falls back to the main line. Undefined when there are none.
 */
export const guideReply = (shown: readonly Candidate[]): Uci | undefined => shown[0]?.move.uci;

/**
 * The opponent in a lesson against `opponent`: inside the guide it plays
 * the guide's most common move for `opponent`'s rating band; from the first
 * position beyond the guide (or at a guide line's end), `beyond` plays.
 *
 * ```ts
 * useGame(lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent)));
 * ```
 */
export function lessonOpponent(
  lesson: Lesson,
  opponent: Opponent,
  beyond: GameOpponent,
): GameOpponent {
  const band = opponentBand(lesson, opponent);
  return {
    id: `${lesson.id}:${beyond.id}`,
    reply: async (line) => {
      const key = lineKeys(line).at(-1)!;
      return guideReply(candidates(lesson, key, band)) ?? beyond.reply(line);
    },
  };
}
