/**
 * Who answers the learner in a lesson: the guide while it has moves, then
 * the opponent engine. The one place that rule lives.
 */
import type { GameOpponent } from '@/game/game';
import type { Opponent } from '@/opponent/opponent';

import type { Lesson, PositionKey } from './lesson';
import { type Candidate, candidates, lineKeys, opponentBand } from './select';

/** Picks the guide's reply at `key` from its moves, most played first; undefined hands over to the engine. */
export type ReplyChoice = (
  replies: readonly Candidate[],
  key: PositionKey,
) => Candidate | undefined;

/**
 * The opponent in a lesson against `opponent`. Inside the guide it plays the
 * guide's most common move in `opponent`'s rating band: the first candidate,
 * since candidates list the most played first, with ties and moves without
 * counts in the file's order (the main line first), and a line that ends
 * where only a marked mistake is left plays it, so the trap shows. From the
 * first position beyond the guide, or where the guide has no move, `beyond`
 * plays, as it does where `choose`, when given, picks none of the guide's
 * moves (a clean Practice run steers to lines not yet passed, and never into
 * a mistake that doesn't count: `steering` in `marks.ts`).
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
      const key = lineKeys(line).at(-1)!;
      const replies = candidates(lesson, key, band);
      const guide = choose ? choose(replies, key) : replies[0];
      return guide?.move.uci ?? beyond.reply(line);
    },
  };
}
