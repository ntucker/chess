/**
 * A finished (or abandoned) game, judged move by move for the review page:
 * each move's label, the moments worth stopping at, and each side's tally.
 * Pure: everything here is worked out from the moves, which of them the
 * lesson's guide recommends, and the final analyses already in the store, so
 * it fills in by itself as searches finish.
 */
import { judgement, type MoveQuality } from '@/analysis/quality';
import { type FinalAnalysis, scoreFor } from '@/evaluation/evaluation';
import type { Color, Ply } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { lineKeys } from '@/lesson/select';

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
      /** `judgeMove`'s label. */
      readonly quality: MoveQuality;
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
  /** How many moves are legal in each position, `legal[n]` in `plies[n]` (`legalMoveCount`). */
  readonly legal: readonly number[];
  /** Stockfish's final analysis of each position, where the store has one. */
  readonly analyses: readonly (FinalAnalysis | undefined)[];
  /** Positions whose search the engine gave up on. */
  readonly failed?: ReadonlySet<number>;
}

/** Each move of the game, judged as far as the final analyses allow. */
export function reviewMoves({ plies, book, legal, analyses, failed }: ReviewInput): ReviewMove[] {
  return plies.slice(0, -1).map(({ turn: mover }, ply): ReviewMove => {
    const uci = plies[ply + 1].move!.uci;
    if (book[ply]) return { ply, mover, status: 'book', quality: 'book' };
    if (legal[ply] === 1) return { ply, mover, status: 'forced', quality: 'best' };
    const before = analyses[ply];
    const judged = before && judgement(before, analyses[ply + 1], uci, mover);
    if (!judged) {
      const lost = (failed?.has(ply) && !before) || (failed?.has(ply + 1) && !analyses[ply + 1]);
      return { ply, mover, status: lost ? 'failed' : 'waiting' };
    }
    return {
      ply,
      mover,
      status: 'judged',
      quality: judged.quality,
      before: scoreFor(before.lines[0].evaluation, mover),
      after: scoreFor(judged.evaluation, mover),
    };
  });
}

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

/**
 * The learner's moves worth stopping at, in game order (their plies): their
 * mistakes and blunders, and `leftGuidePly`, the move where they left the
 * lesson's guide (`leftGuide`), if any.
 */
export function moments(
  moves: readonly ReviewMove[],
  learner: Color,
  leftGuidePly?: number,
): number[] {
  return moves
    .filter(
      ({ ply, mover, quality }) =>
        mover === learner &&
        (ply === leftGuidePly || quality === 'mistake' || quality === 'blunder'),
    )
    .map(({ ply }) => ply);
}

/**
 * The moment "Next moment" goes to: the earliest of `moments` not yet
 * `visited`, so one confirmed late, behind the board, isn't skipped.
 */
export const nextMoment = (moments: readonly number[], visited: ReadonlySet<number>) =>
  moments.find((ply) => !visited.has(ply));

/** How many moves got each label. */
export type Tally = Readonly<Partial<Record<MoveQuality, number>>>;

/** How many of `side`'s judged moves got each label. */
export function tally(moves: readonly ReviewMove[], side: Color): Tally {
  const counts: Partial<Record<MoveQuality, number>> = {};
  for (const { mover, quality } of moves) {
    if (mover === side && quality) counts[quality] = (counts[quality] ?? 0) + 1;
  }
  return counts;
}
