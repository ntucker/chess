/**
 * A finished (or abandoned) game, judged move by move for the review page:
 * each move's label, the moments worth stopping at, and each side's tally.
 * Pure: everything here is worked out from the moves, which of them the
 * lesson's guide recommends, and the final analyses already in the store, so
 * it fills in by itself as searches finish.
 */
import { labelMove, type ReviewQuality } from '@/analysis/quality';
import { type Analysis, type FinalAnalysis, isFinal, scoreFor } from '@/evaluation/evaluation';
import type { Color, Ply } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { lineKeys } from '@/lesson/select';

import { refine } from './refine';

/**
 * One move of the game as the review judges it: the move leading from
 * `plies[ply]` to `plies[ply + 1]`, and how far the review has got with it.
 */
export type ReviewMove = { readonly ply: number; readonly mover: Color } & (
  | {
      /** A move the guide recommends: labelled `book`, never searched. */
      readonly status: 'book';
      readonly quality: 'book';
    }
  | {
      /** The only legal move: labelled `best`, as the game labels it, and left out of accuracy. */
      readonly status: 'forced';
      readonly quality: 'best';
    }
  | {
      /** A position its label needs failed to search: no label, and left out of accuracy. */
      readonly status: 'failed';
      readonly quality?: undefined;
    }
  | {
      /** The analyses its label needs aren't final yet. */
      readonly status: 'waiting';
      readonly quality?: undefined;
    }
  | {
      readonly status: 'judged';
      /** `judgeMove`'s label, or the one `refine` makes of it. */
      readonly quality: ReviewQuality;
      /** The mover's expected score (0 to 1) before the move and after it, as the label measured them. */
      readonly before: number;
      readonly after: number;
    }
);

/** What the review needs to know about a game. */
export interface ReviewInput {
  /** Every position of the game; `plies[n]` follows the nth move. */
  readonly plies: readonly Ply[];
  /** Whether the guide recommends each move (`bookMoves`); empty for a game with no lesson. */
  readonly book: readonly boolean[];
  /** How many moves are legal in each position, `legal[n]` in `plies[n]` (`legalMoveCountAt`). */
  readonly legal: readonly number[];
  /** Stockfish's final analysis of each position, where the store has one. */
  readonly analyses: readonly (FinalAnalysis | undefined)[];
  /** Positions whose search the engine gave up on. */
  readonly failed: ReadonlySet<number>;
  /** What each move gives up in material, `givenUp[n]` by the move from `plies[n]` (`movesGivenUp`). */
  readonly givenUp: readonly number[];
}

/**
 * Each move of the game, labelled as far as the final analyses allow
 * (`labelMove`, as the game labels it, then `refine`), or why it isn't yet.
 */
export function reviewMoves(input: ReviewInput): ReviewMove[] {
  const labelled = labelledMoves(input);
  return labelled.map((move) =>
    move.status === 'judged'
      ? { ...move, quality: refine(move, labelled[move.ply - 1], input) }
      : move,
  );
}

/** Each move of the game with `labelMove`'s label, as the game labels it, or why it hasn't one yet. */
function labelledMoves({ plies, book, legal, analyses, failed }: ReviewInput): ReviewMove[] {
  return plies.slice(0, -1).map(({ turn: mover }, ply): ReviewMove => {
    const before = analyses[ply];
    const label = labelMove({
      uci: plies[ply + 1].move!.uci,
      mover,
      book: book[ply],
      legal: legal[ply],
      before,
      after: analyses[ply + 1],
    });
    if (!label) {
      // With the position before final, the label waits only on the one after.
      const lost = before
        ? lostPosition(failed, analyses, ply + 1)
        : lostPosition(failed, analyses, ply);
      return { ply, mover, status: lost ? 'failed' : 'waiting' };
    }
    if (label.status !== 'judged') return { ply, mover, ...label };
    return {
      ply,
      mover,
      status: 'judged',
      quality: label.quality,
      before: scoreFor(before!.lines[0].evaluation, mover),
      after: scoreFor(label.evaluation, mover),
    };
  });
}

/**
 * Whether the search of position `ply` (`plies[ply]`) failed for good: the
 * engine gave up on it (`failed`) and the store has no final analysis of it.
 */
export const lostPosition = (
  failed: ReadonlySet<number>,
  analyses: readonly (Analysis | undefined)[],
  ply: number,
) => failed.has(ply) && !isFinal(analyses[ply]);

/**
 * The positions the label of the move from position `ply` needs, in order:
 * the one before it, the one after it, and the one before the opponent's
 * previous move, which the Miss label reads.
 */
export const labelPositions = (ply: number) => (ply > 0 ? [ply, ply + 1, ply - 1] : [ply, ply + 1]);

/**
 * Whether the review searches the position after `ply` of a game of
 * `moves` moves in full: a move the guide doesn't recommend leads into it
 * or out of it. A position only book moves touch is never searched, since
 * its moves are labelled `book`.
 */
export const judgedPosition = (book: readonly boolean[], ply: number, moves: number) =>
  (ply > 0 && !book[ply - 1]) || (ply < moves && !book[ply]);

/**
 * The ply of the move where `learner` left `lesson`'s guide: their first
 * move, in a position where the guide recommends one, that isn't one it
 * recommends. Undefined while every such move is the guide's, and when the
 * opponent left it first, since no guide move is left to compare with.
 */
export function leftGuide(
  lesson: Lesson,
  line: readonly Uci[],
  learner: Color,
  book: readonly boolean[],
): number | undefined {
  const keys = lineKeys(line);
  const ply = line.findIndex((_, n) => {
    const turn = n % 2 === 0 ? 'white' : 'black';
    return (
      turn === learner && !book[n] && !!lesson.positions[keys[n]]?.moves.some((move) => move.book)
    );
  });
  return ply === -1 ? undefined : ply;
}

/** The labels whose moves are worth stopping at: the review's own three, and the worst two. */
const MOMENTS: ReadonlySet<ReviewQuality | undefined> = new Set([
  'brilliant',
  'great',
  'miss',
  'mistake',
  'blunder',
]);

/**
 * The learner's moves worth stopping at, in game order (their plies): their
 * brilliant, great and missed moves, mistakes and blunders, and
 * `leftGuidePly`, the move where they left the lesson's guide (`leftGuide`),
 * if any.
 */
export function moments(
  moves: readonly ReviewMove[],
  learner: Color,
  leftGuidePly?: number,
): number[] {
  return moves
    .filter(
      ({ ply, mover, quality }) =>
        mover === learner && (ply === leftGuidePly || MOMENTS.has(quality)),
    )
    .map(({ ply }) => ply);
}

/**
 * The moment "Next moment" goes to: the earliest of `moments` not yet
 * `visited`, so one confirmed late, behind the board, isn't skipped.
 */
export const nextMoment = (moments: readonly number[], visited: ReadonlySet<number>) =>
  moments.find((ply) => !visited.has(ply));

/** The labels of moves that gave nothing much away: best and good, and the review's Brilliant and Great. */
const FINE: ReadonlySet<ReviewQuality | undefined> = new Set([
  'best',
  'good',
  'brilliant',
  'great',
]);

/** Whether a move labelled `quality` gave nothing much away (`FINE`). */
export const isFine = (quality: ReviewQuality | undefined) => FINE.has(quality);

/** Each label's place in the tally, from the best moves to the worst; a Record, so none is left out. */
const TALLY_PLACE: Readonly<Record<ReviewQuality, number>> = {
  brilliant: 0,
  great: 1,
  best: 2,
  good: 3,
  book: 4,
  inaccuracy: 5,
  miss: 6,
  mistake: 7,
  blunder: 8,
};

/** Every label, from the best moves to the worst: the order the tally lists them in. */
export const LABELS_BEST_FIRST = (Object.keys(TALLY_PLACE) as ReviewQuality[]).sort(
  (a, b) => TALLY_PLACE[a] - TALLY_PLACE[b],
);

/** How many moves got each label. */
export type Tally = Readonly<Partial<Record<ReviewQuality, number>>>;

/** How many of `side`'s judged moves got each label. */
export function tally(moves: readonly ReviewMove[], side: Color): Tally {
  const counts: Partial<Record<ReviewQuality, number>> = {};
  for (const { mover, quality } of moves) {
    if (mover === side && quality) counts[quality] = (counts[quality] ?? 0) + 1;
  }
  return counts;
}
