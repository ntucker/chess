/**
 * How a finished game ended for the learner, as JSON for the board's web view
 * (Board.tsx) and the card over it (EndingCard.tsx). The board imports only
 * the types, so it bundles none of the rules `gameEnding` reads the position with.
 */
import type { Color, SquareName } from 'chessops/types';
import { makeSquare } from 'chessops/util';

import { type Position, parsePosition } from '@/game/replay';

/** The learner's side of the result: they mated, were mated, or neither won. */
export type Mood = 'won' | 'lost' | 'drawn';

export interface Ending {
  readonly mood: Mood;
  /** The side that mated; none for a draw. */
  readonly winner?: Color;
  readonly reason: NonNullable<Position['result']>['reason'];
  /** The square each king stands on at the end. */
  readonly kings: Readonly<Record<Color, SquareName>>;
}

/** How the game ended at `position` for the learner playing `learner`; none while it goes on. */
export function gameEnding(
  { fen, result }: Pick<Position, 'fen' | 'result'>,
  learner: Color,
): Ending | undefined {
  if (!result) return undefined;
  const { winner, reason } = result;
  const mood = !winner ? 'drawn' : winner === learner ? 'won' : 'lost';
  const { board } = parsePosition(fen)!;
  const kings = {
    white: makeSquare(board.kingOf('white')!),
    black: makeSquare(board.kingOf('black')!),
  };
  return winner ? { mood, winner, reason, kings } : { mood, reason, kings };
}

const DRAWS: Record<Exclude<Ending['reason'], 'checkmate'>, string> = {
  stalemate: 'Stalemate',
  'insufficient material': 'Not enough to mate',
  'threefold repetition': 'Threefold repetition',
  'fifty-move rule': 'Fifty-move rule',
};

/** What the card over the board says: what ended the game, and who won it, called `rival` if not the learner. */
export function endingWords({ mood, reason }: Pick<Ending, 'mood' | 'reason'>, rival: string) {
  if (reason !== 'checkmate') return { eyebrow: 'Draw', title: DRAWS[reason] };
  return { eyebrow: 'Checkmate', title: mood === 'won' ? 'You win' : `${rival} wins` };
}
