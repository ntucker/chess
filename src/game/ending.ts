/**
 * How a finished game ended for the learner: its verdict for the status panel,
 * words for the card over the board (EndingCard.tsx), and JSON for the board's
 * web view (Board.tsx), which imports only the types, so it bundles none of the
 * rules `gameEnding` reads the position with.
 */
import type { Color, SquareName } from 'chessops/types';
import { makeSquare } from 'chessops/util';

import {
  type DrawReason,
  type GameResult,
  opposite,
  parsePosition,
  type Position,
} from '@/game/replay';

/**
 * The learner's side of the result, and what ended the game: a mate they
 * gave or took, or a draw.
 */
export type Verdict =
  | { readonly mood: 'won' | 'lost'; readonly reason: 'checkmate' }
  | { readonly mood: 'drawn'; readonly reason: DrawReason };
export type Mood = Verdict['mood'];

export type Ending = Verdict & {
  /** The square each side's king stands on at the end: the learner's, and the other side's. */
  readonly kings: Readonly<Record<'learner' | 'rival', SquareName>>;
};

/** How `result` went for the learner playing `learner`. */
export const resultVerdict = (result: GameResult, learner: Color): Verdict =>
  result.reason === 'checkmate'
    ? { mood: result.winner === learner ? 'won' : 'lost', reason: result.reason }
    : { mood: 'drawn', reason: result.reason };

/** How the game ended at `position` for the learner playing `learner`; none while it goes on. */
export function gameEnding(
  { fen, result }: Pick<Position, 'fen' | 'result'>,
  learner: Color,
): Ending | undefined {
  if (!result) return undefined;
  // A game's positions are legal ones, which parse and have both kings.
  const { board } = parsePosition(fen)!;
  return {
    ...resultVerdict(result, learner),
    kings: {
      learner: makeSquare(board.kingOf(learner)!),
      rival: makeSquare(board.kingOf(opposite(learner))!),
    },
  };
}

const DRAWS: Record<DrawReason, string> = {
  stalemate: 'Stalemate',
  'insufficient material': 'Not enough to mate',
  'threefold repetition': 'Threefold repetition',
  'fifty-move rule': 'Fifty-move rule',
};

/**
 * What the card over the board says. Example: a loss by mate to Maia reads
 * "Checkmate" over "Maia wins"; a stalemate reads "Draw" over "Stalemate".
 */
export function endingWords(verdict: Verdict, rival: string) {
  if (verdict.mood === 'drawn') return { eyebrow: 'Draw', title: DRAWS[verdict.reason] };
  return { eyebrow: 'Checkmate', title: verdict.mood === 'won' ? 'You win' : `${rival} wins` };
}
