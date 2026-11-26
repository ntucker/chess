/**
 * Retrying a moment. At the learner's move worth another go, the review
 * hides Stockfish's moves until a try beats the move or Show best shows the
 * answer. Example: after 7...Qxb2, a blunder, Retry puts the board back one
 * move; the try 7...Nc6 is Stockfish's best, so it passes and the moves show.
 * Pure, like the rest of the review: worked out from the page's state
 * (`screen.ts`), the moves and the final analyses in the store.
 */
import {
  type BookLabel,
  judgement,
  labelMove,
  type MoveQuality,
  type ReviewQuality,
} from '@/analysis/quality';
import { type FinalAnalysis, type MoveChange, moveChange, scoreFor } from '@/evaluation/evaluation';
import { type Color, parsePosition, playMove, type Ply } from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { variationHref } from '@/lesson/openings';
import { bookLabel, lineKeys } from '@/lesson/select';

import { isFine, type ReviewMove } from './review';
import type { ReviewScreen } from './screen';

/** A try at a moment, judged as the game judges a move (`labelMove`), or why it isn't yet. */
export type Try = { readonly uci: Uci; readonly san: string } & (
  | {
      /** The position it reaches is still being searched (`waiting`), or the search gave up. */
      readonly status: 'waiting' | 'failed';
    }
  | {
      readonly status: 'judged';
      readonly quality: MoveQuality;
      /** How it changes the position for the learner beside Stockfish's best, where that's known. */
      readonly change?: MoveChange;
      /** Whether it beats the game's move: see `passes`. */
      readonly passed: boolean;
    }
);

/**
 * What a moment hides until a try passes or Show best: the guide's move at
 * the move that left it, else Stockfish's best.
 */
export interface Answer {
  readonly uci: Uci;
  readonly san: string;
  readonly quality: BookLabel | 'best';
  /** At the guide's move: what the lesson says it does, and where "Practice this line" opens it. */
  readonly guide?: GuideAnswer;
}

/** The guide's move where the learner left it, as the lesson holds it. */
export interface GuideAnswer {
  readonly uci: Uci;
  /** The guide's own move (`book`), or one an opportunity's line adds (`opportunity`). */
  readonly quality: BookLabel;
  /** The lesson's idea note for the move, if it has one. */
  readonly note?: string;
  /** Where "Practice this line" opens the lesson: at the variation the move leads into. */
  readonly practice: ReturnType<typeof variationHref>;
}

/**
 * The guide's book moves in the position after `line`, each with its
 * label, and the first of them as the answer where the learner left the
 * guide there.
 */
export function guideAt(lesson: Lesson, line: readonly Uci[]) {
  const position = lesson.positions[lineKeys(line).at(-1)!];
  const book = (position?.moves ?? []).filter((move) => move.book);
  const [first] = book;
  const answer: GuideAnswer | undefined = first && {
    uci: first.uci,
    quality: bookLabel(first)!,
    note: first.notes?.[0]?.text,
    practice: variationHref(
      lesson.id,
      lesson.positions[lineKeys([...line, first.uci]).at(-1)!]?.variation ?? position.variation,
    ),
  };
  return { book: new Map(book.map((move) => [move.uci, bookLabel(move)!])), answer };
}

/** What a moment shows: everything the panel, the board and the actions need to retry it. */
export interface Moment {
  /** Whether Retry does something: at a move to retry, while the board isn't already waiting for a try. */
  readonly canRetry: boolean;
  /** Show best's answer at a move to retry, once the position before it is searched. */
  readonly answer?: Answer;
  /** Whether a try has passed or Show best was pressed: the comparison shows, and Show best is disabled. */
  readonly revealed: boolean;
  /** Whether Stockfish's moves stay hidden: at the learner's move, until it's judged fine or revealed. */
  readonly hidden: boolean;
  /** The tries at this moment, oldest first. */
  readonly tries: readonly Try[];
  /** The first try waiting for its search, which goes before the review's own. */
  readonly searching?: number;
  /** What the board shows (`ReviewScreen.board`), `game` for the game's move. */
  readonly board: NonNullable<ReviewScreen['board']> | 'game';
  /** The move the board shows played in place of the game's: the latest try, or the answer. */
  readonly shownMove?: Uci;
  /** The label badged on the board's last move: the game's move's, the try's or the answer's; none during a retry. */
  readonly badge?: ReviewQuality;
  /**
   * The game's move, drawn as a danger arrow beside a revealed try or answer,
   * while its piece still stands where it moved from: not after a try with the same piece.
   */
  readonly arrow?: Uci;
  /**
   * Once revealed, the line "Play on from here" starts from: the game's moves
   * before this one, then in its place the try or answer the board shows,
   * else the latest try that passed, else the answer.
   */
  readonly playOn?: readonly Uci[];
}

/** What `momentAt` reads. */
export interface MomentOf {
  readonly plies: readonly Ply[];
  /** The moves as judged (`reviewMoves`). */
  readonly moves: readonly ReviewMove[];
  /** Each position's final analysis, where the store has one. */
  readonly analyses: readonly (FinalAnalysis | undefined)[];
  /** How many moves are legal in each position (`legalMoveCountAt`). */
  readonly legal: readonly number[];
  readonly learner: Color;
  /** The ply of the move where the learner left the guide (`leftGuide`). */
  readonly leftAt?: number;
  /** The guide's book moves in the position before the move shown, with their labels: a try among them passes. */
  readonly book: ReadonlyMap<Uci, BookLabel>;
  /** At the move where the learner left the guide, the guide's move there. */
  readonly guide?: GuideAnswer;
  readonly screen: Pick<ReviewScreen, 'ply' | 'tries' | 'shown' | 'board'>;
  /** The final analysis of the position after each try at `screen.ply`, where the store has one. */
  readonly tryAnalyses: readonly (FinalAnalysis | undefined)[];
  /** Whether the search after each try gave up. */
  readonly tryFailed: readonly boolean[];
}

/**
 * The moment at `screen.ply`: whether it can be retried, its tries judged,
 * its answer, and whether Stockfish's moves are hidden. A move that was fine
 * (best, good, book) or was the opponent's shows its comparison at once and
 * has nothing to retry.
 */
export function momentAt({
  plies,
  moves,
  analyses,
  legal,
  learner,
  leftAt,
  book,
  guide,
  screen,
  tryAnalyses,
  tryFailed,
}: MomentOf): Moment {
  const { ply } = screen;
  const move = ply > 0 ? moves[ply - 1] : undefined;
  const before = ply > 0 ? analyses[ply - 1] : undefined;
  const board = screen.board ?? 'game';
  if (!move || move.mover !== learner) return { ...NOTHING, board, badge: move?.quality };
  const pos = parsePosition(plies[ply - 1].fen)!;
  const sanOf = (uci: Uci) => playMove(pos.clone(), uci)?.san ?? uci;
  const tries = (screen.tries.get(ply) ?? []).map((uci, n): Try => {
    const san = sanOf(uci);
    const after = tryAnalyses[n];
    const label = labelMove({
      uci,
      mover: learner,
      book: book.get(uci),
      legal: legal[ply - 1],
      before,
      after,
    });
    if (!label) return { uci, san, status: tryFailed[n] ? 'failed' : 'waiting' };
    // A book move's label needs no search, but its line can say how it scores.
    const judged =
      label.status === 'judged' ? label : before && judgement(before, after, uci, learner);
    return {
      uci,
      san,
      status: 'judged',
      quality: label.quality,
      change:
        judged && before
          ? moveChange(before.lines[0].evaluation, judged.evaluation, learner)
          : undefined,
      passed:
        label.status === 'book' ||
        (!!judged && passes(label.quality, scoreFor(judged.evaluation, learner), move)),
    };
  });
  const retryable = retries(move, leftAt);
  const best = before?.lines[0].uci;
  const answerUci = guide?.uci ?? best;
  const answer: Answer | undefined =
    retryable && before && answerUci
      ? { uci: answerUci, san: sanOf(answerUci), quality: guide?.quality ?? 'best', guide }
      : undefined;
  const passed = tries.filter((tried) => tried.status === 'judged' && tried.passed);
  const revealed = screen.shown.has(ply) || passed.length > 0;
  const latest = tries.at(-1);
  const onBoard =
    board === 'try' && latest
      ? { uci: latest.uci, quality: latest.status === 'judged' ? latest.quality : undefined }
      : board === 'answer'
        ? answer
        : undefined;
  const searching = tries.findIndex(({ status }) => status === 'waiting');
  const shownPasses =
    onBoard && (board === 'answer' || passed.some(({ uci }) => uci === onBoard.uci));
  const correction = revealed
    ? shownPasses
      ? onBoard.uci
      : (passed.at(-1)?.uci ?? answer?.uci)
    : undefined;
  return {
    canRetry: !!answer && board !== 'retry',
    answer,
    revealed,
    hidden: !revealed && (retryable || move.status === 'waiting'),
    tries,
    searching: searching === -1 ? undefined : searching,
    board,
    shownMove: onBoard?.uci,
    badge: board === 'game' ? move.quality : onBoard?.quality,
    arrow: onBoard && revealed ? arrowBeside(plies[ply].move?.uci, onBoard.uci) : undefined,
    playOn:
      correction === undefined
        ? undefined
        : [...plies.slice(1, ply).flatMap(({ move }) => (move ? [move.uci] : [])), correction],
  };
}

/** The game's move `game` as an arrow beside `played`, unless `played` moved its piece away. */
const arrowBeside = (game: Uci | undefined, played: Uci) =>
  game && game.slice(0, 2) !== played.slice(0, 2) ? game : undefined;

/** A moment with nothing to retry. */
const NOTHING = { canRetry: false, revealed: false, hidden: false, tries: [] } as const;

/** Whether the learner's `move` is worth retrying: one that isn't `isFine`, or the move that left the guide. */
const retries = (move: ReviewMove, leftAt: number | undefined) =>
  move.ply === leftAt || (move.status === 'judged' && !isFine(move.quality));

/**
 * Whether a try labelled `quality`, scoring `score` (the learner's expected
 * score, 0 to 1), beats the game's `move`: it's best or good, and better
 * than the move was. (`momentAt` passes the guide's move, labelled book, without asking.)
 */
const passes = (quality: MoveQuality, score: number, move: ReviewMove) =>
  isFine(quality) && move.status === 'judged' && score > move.after;
