/**
 * Who answers the learner in a lesson: the guide while it has moves, then
 * the opponent engine. The one place that rule lives.
 */
import type { GameOpponent } from '@/game/game';
import type { Opponent } from '@/opponent/opponent';

import type { Lesson } from './lesson';
import { type Candidate, candidates, lineKeys, opponentBand } from './select';

/** Picks the guide's reply from its moves, most played first. */
export type ReplyChoice = (replies: readonly Candidate[]) => Candidate | undefined;

/**
 * The opponent in a lesson against `opponent`. Inside the guide it plays the
 * guide's most common move in `opponent`'s rating band: the first candidate,
 * since candidates list the most played first, with ties and moves without
 * counts in the file's order (the main line first). From the first position
 * beyond the guide, or at a guide line's end, `beyond` plays. `choose`,
 * when given, picks among the guide's moves instead (Practice steers to
 * lines not yet passed: `steeredReply`).
 *
 * ```ts
 * useGame(store, lessonOpponent(lesson, opponent, gameOpponent(ctrl, opponent)), {
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
  choose?: ReplyChoice,
): GameOpponent {
  const band = opponentBand(lesson, opponent);
  return {
    // A new choice asks again: a reply chosen the other way no longer fits.
    id: `${lesson.id}:${choose ? 'chosen:' : ''}${beyond.id}`,
    reply: async (line) => {
      const replies = candidates(lesson, lineKeys(line).at(-1)!, band);
      const guide = choose ? choose(replies) : replies[0];
      return guide?.move.uci ?? beyond.reply(line);
    },
  };
}
