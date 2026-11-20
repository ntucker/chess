/**
 * How a finished game ended for the learner: its mood for the status panel,
 * words for the card over the board (EndingCard.tsx), and JSON for the board's
 * web view (Board.tsx), which imports only the types, so it bundles none of the
 * rules `gameEnding` reads the position with.
 */
import type { Color, SquareName } from 'chessops/types';
import { makeSquare } from 'chessops/util';

import { type GameResult, opposite, parsePosition, type Position } from '@/game/replay';

/** The learner's side of the result: they mated, were mated, or neither won. */
export type Mood = 'won' | 'lost' | 'drawn';

export interface Ending {
  readonly mood: Mood;
  readonly reason: GameResult['reason'];
  /** The square each side's king stands on at the end: the learner's, and the other side's. */
  readonly kings: Readonly<Record<'learner' | 'rival', SquareName>>;
}

/** How `result` went for the learner playing `learner`. */
export const resultMood = ({ winner }: GameResult, learner: Color): Mood =>
  !winner ? 'drawn' : winner === learner ? 'won' : 'lost';

/** How the game ended at `position` for the learner playing `learner`; none while it goes on. */
export function gameEnding(
  { fen, result }: Pick<Position, 'fen' | 'result'>,
  learner: Color,
): Ending | undefined {
  if (!result) return undefined;
  // A game's positions are legal ones, which parse and have both kings.
  const { board } = parsePosition(fen)!;
  return {
    mood: resultMood(result, learner),
    reason: result.reason,
    kings: {
      learner: makeSquare(board.kingOf(learner)!),
      rival: makeSquare(board.kingOf(opposite(learner))!),
    },
  };
}

/** What ended the game, as the card names it. */
const REASONS: Record<Ending['reason'], string> = {
  checkmate: 'Checkmate',
  stalemate: 'Stalemate',
  'insufficient material': 'Not enough to mate',
  'threefold repetition': 'Threefold repetition',
  'fifty-move rule': 'Fifty-move rule',
};

/**
 * What the card over the board says. Example: a loss by mate to Maia reads
 * "Checkmate" over "Maia wins"; a stalemate reads "Draw" over "Stalemate".
 */
export function endingWords({ mood, reason }: Pick<Ending, 'mood' | 'reason'>, rival: string) {
  if (mood === 'drawn') return { eyebrow: 'Draw', title: REASONS[reason] };
  return { eyebrow: REASONS[reason], title: mood === 'won' ? 'You win' : `${rival} wins` };
}
