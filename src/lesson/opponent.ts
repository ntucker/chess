/**
 * Who answers the learner in a lesson: the guide while it has moves, then
 * the opponent engine. The one place that rule lives.
 */
import type { GameOpponent } from '@/game/game';
import type { Opponent } from '@/opponent/opponent';

import type { Lesson } from './lesson';
import { candidates, lineKeys, opponentBand } from './select';

/**
 * The opponent in a lesson against `opponent`. Inside the guide it plays the
 * guide's most common move in `opponent`'s rating band: the first candidate,
 * since candidates list the most played first, with ties and moves without
 * counts in the file's order (the main line first). From the first position
 * beyond the guide, or at a guide line's end, `beyond` plays.
 *
 * ```ts
 * useGame(lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent)), {
 *   side: lesson.side,
 *   active: useIsFocused(),
 *   judge: 'stockfish',
 * });
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
      const [guide] = candidates(lesson, lineKeys(line).at(-1)!, band);
      return guide?.move.uci ?? beyond.reply(line);
    },
  };
}
