/**
 * How good a move was, as chess.com labels moves: by how much of the mover's
 * expected score it gave away.
 */
import {
  type Analysis,
  type Evaluation,
  type FinalAnalysis,
  forSide,
  type MoveChange,
  moveChange,
} from '@/evaluation/evaluation';
import { type Color, opposite } from '@/game/replay';

/**
 * The labels, from best to worst. The first two are a lesson's book moves
 * (`BookLabel`), which come from lesson data, so `judgeMove` never returns them.
 */
export type MoveQuality =
  'book' | 'opportunity' | 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * A book move's label, never searched: `book` for the guide's own move, and
 * `opportunity` for one an opportunity's line adds (`LessonMove.found`), so
 * the learner can tell the guide's line from the finder's idea.
 */
export type BookLabel = 'book' | 'opportunity';

/** Each move's `BookLabel` where it is a book move: `bookLabels[n]` for the nth move. */
export type BookLabels = readonly (BookLabel | undefined)[];

/**
 * The review's labels: `MoveQuality`'s, and three it refines a judged move's
 * into once the whole game is searched (src/review/refine.ts): Brilliant and
 * Great for a best or good move, Miss for a mistake or blunder.
 */
export type ReviewQuality = MoveQuality | 'brilliant' | 'great' | 'miss';

/** The least expected score (0 to 1, the mover's) a mistake gives away (see `LEAST_LOSS`). */
export const MISTAKE_LOSS = 0.1;

/**
 * The least expected score (0 to 1, the mover's) a move must give away for
 * each label. These are chess.com's "expected points lost" limits
 * (https://support.chess.com/en/articles/8572705), with its "excellent"
 * (under 0.02) folded into good. Lichess, on the same win-chance curve the
 * app's evaluations use, is stricter about blunders: 0.05, 0.10 and 0.15
 * (lila's modules/tree/src/main/Advice.scala, whose winning chances run from
 * -1 to 1, so its 0.1, 0.2 and 0.3 are half as much expected score).
 */
const LEAST_LOSS: readonly (readonly [number, MoveQuality])[] = [
  [0.2, 'blunder'],
  [MISTAKE_LOSS, 'mistake'],
  [0.05, 'inaccuracy'],
];

/** An expected score (0 to 1) as a percentage of the winning chances: "15%". */
export const percent = (score: number) => `${Math.round(score * 100)}%`;

/** A share as `percent` shows it, but to a tenth under 10% ("3.5%"), so small shares that differ read apart. */
export function finePercent(share: number): string {
  // Rounded first, so a share just under 10% reads "10%", never "10.0%".
  const tenths = Math.round(share * 1000);
  return tenths < 100 ? `${(tenths / 10).toFixed(1)}%` : percent(share);
}

/**
 * The expected score a move gave away (0 to 1) as `percent` shows it, when
 * that shows any: "26%" for 0.26, nothing for 0.004 or a gain.
 */
export const lostPercent = (loss: number) =>
  Math.round(loss * 100) > 0 ? percent(loss) : undefined;

/**
 * What `quality` means, in words for its badge's tooltip. Example: "gave
 * away 10% to 20% of the winning chances" for a mistake, from `LEAST_LOSS`.
 */
export function qualityRule(quality: MoveQuality): string {
  if (quality === 'book') return "the guide's own move";
  if (quality === 'opportunity') return "a move of an opportunity's line, not the guide's";
  if (quality === 'best') return "Stockfish's top move, or one that gives nothing away";
  const at = LEAST_LOSS.findIndex(([, label]) => label === quality);
  const range =
    at < 0
      ? `under ${percent(LEAST_LOSS.at(-1)![0])}` // good
      : at === 0
        ? `${percent(LEAST_LOSS[0][0])} or more`
        : `${percent(LEAST_LOSS[at][0])} to ${percent(LEAST_LOSS[at - 1][0])}`;
  return `gave away ${range} of the winning chances`;
}

/**
 * A move's label, from the analysis of the position before it and, unless
 * that lists the move, the position after it; undefined while one it needs
 * is missing. The first line is the position's score; the move is the best
 * if it's the line's move, or gives nothing away (another mate, or an
 * engine that names no move, like Maia). That's broader than chess.com,
 * which keeps "best" for the engine's own move: a second move that loses
 * nothing is as good for learning an opening. Otherwise the expected score
 * it gives away decides, judged by the move's own line where `before`
 * lists it, so a label agrees with the list. A move the list skips is
 * judged by `after`'s first line, but never as better than the list's last
 * move: the search ranked it below that, and a search of the next position
 * can disagree with it by more than an inaccuracy.
 */
export function judgeMove(
  before: FinalAnalysis,
  after: FinalAnalysis | undefined,
  uci: string,
  mover: Color,
): MoveQuality | undefined {
  return judgement(before, after, uci, mover)?.quality;
}

/**
 * `judgeMove`'s label, with what decided it (`moveLoss`): the expected score
 * the move gives away for `mover`, and the evaluation it was judged by.
 */
export function judgement(
  before: FinalAnalysis,
  after: FinalAnalysis | undefined,
  uci: string,
  mover: Color,
): ({ quality: MoveQuality } & MoveLoss) | undefined {
  const judged = moveLoss(before, after, uci, mover);
  if (!judged) return undefined;
  const { loss } = judged;
  const quality: MoveQuality =
    uci === before.lines[0].uci || loss <= 0
      ? 'best'
      : (LEAST_LOSS.find(([threshold]) => loss >= threshold)?.[1] ?? 'good');
  return { quality, ...judged };
}

/** What a move gives away beside the best (0 to 1, the mover's), and the evaluation that judges it. */
export interface MoveLoss {
  readonly loss: number;
  readonly evaluation: Evaluation;
}

/**
 * The expected score (0 to 1) `uci` gives away for `mover` beside the best
 * move, and the evaluation it is judged by, by `judgement`'s rule. It takes
 * analyses that may not be final, to screen moves before searching them in
 * full (src/opportunity); a label must come from final ones (`judgement`).
 */
export function moveLoss(
  before: Analysis,
  after: Analysis | undefined,
  uci: string,
  mover: Color,
): MoveLoss | undefined {
  const evaluation = judgedEvaluation(before, after, uci, mover);
  return (
    evaluation && {
      loss: signed(before.lines[0].evaluation, mover) - signed(evaluation, mover),
      evaluation,
    }
  );
}

/**
 * What Stockfish makes of a move: its label, how it changes the position for
 * the learner, and what it gives away for the side that plays it (`MoveLoss`).
 */
export interface EngineVerdict {
  readonly quality: MoveQuality;
  readonly change: MoveChange;
  readonly loss: number;
}

/**
 * Stockfish's verdict on `uci`, played by `mover` in the position `before`
 * analyses: its label (`judgement`), the pawns it gains or loses for
 * `learner` beside the best (`moveChange`), so the best reads "0.0", and the
 * expected score it gives away for `mover` (`moveLoss`). A move
 * `before` doesn't list needs `after`, the final analysis of the position it
 * leads to; undefined while that is missing.
 */
export function engineVerdict(
  before: FinalAnalysis,
  after: FinalAnalysis | undefined,
  uci: string,
  mover: Color,
  learner: Color,
): EngineVerdict | undefined {
  const judged = judgement(before, after, uci, mover);
  return (
    judged && {
      quality: judged.quality,
      change: moveChange(before.lines[0].evaluation, judged.evaluation, learner),
      loss: judged.loss,
    }
  );
}

/**
 * The reply that punishes a move labelled `quality` (a mistake or a blunder),
 * from `after`, the final analysis of the position the move reached: its
 * first line's move, when that is clearly the best, meaning the replier's
 * second line would itself be a mistake beside it. Example: a queen move that
 * leaves a bishop to be taken for free, where taking it is the only move that
 * wins. A slip with no one answer (a mistake that only loosens the position)
 * has none, and nor does a forced reply (no second line) or an analysis that
 * names no move (Maia's, a finished game's).
 */
export function refutation(
  quality: ReviewQuality | undefined,
  after: FinalAnalysis | undefined,
  mover: Color,
): string | undefined {
  if (!isMistake(quality) || !after) return undefined;
  const [best, second] = after.lines;
  if (!best?.uci || !second?.uci) return undefined;
  return isMistake(judgeMove(after, undefined, second.uci, opposite(mover))) ? best.uci : undefined;
}

/** Whether `quality` is a mistake or a blunder: a slip one reply may punish (`refutation`). */
export const isMistake = (quality: ReviewQuality | undefined) =>
  quality === 'mistake' || quality === 'blunder';

/** A game's move, as `labelMove` needs it. */
export interface GameMove {
  readonly uci: string;
  readonly mover: Color;
  /** Its label where the lesson books it (`BookLabel`). */
  readonly book?: BookLabel;
  /** How many moves were legal where it was played; without it a forced move waits for its search. */
  readonly legal?: number;
  /** Stockfish's final analyses of the positions before the move and after it, where there are. */
  readonly before?: FinalAnalysis;
  readonly after?: FinalAnalysis;
}

/** Why a move has its label: a book move, the only legal move, or `judgement`'s. */
export type MoveLabel =
  | { readonly status: 'book'; readonly quality: BookLabel }
  | { readonly status: 'forced'; readonly quality: 'best' }
  | { readonly status: 'judged'; readonly quality: MoveQuality; readonly evaluation: Evaluation };

/**
 * A move's label, the one rule the game and the review share: its
 * `BookLabel` for a book move, which is never searched; `best` for the only legal
 * move, as Stockfish would rank it; else `judgement`'s, undefined while an
 * analysis it needs is missing.
 */
export function labelMove({
  uci,
  mover,
  book,
  legal,
  before,
  after,
}: GameMove): MoveLabel | undefined {
  if (book) return { status: 'book', quality: book };
  if (legal === 1) return { status: 'forced', quality: 'best' };
  const judged = before && judgement(before, after, uci, mover);
  return judged && { status: 'judged', quality: judged.quality, evaluation: judged.evaluation };
}

/** The evaluation `judgement` judges `uci` by; undefined while `after` is needed and missing. */
function judgedEvaluation(
  before: Analysis,
  after: Analysis | undefined,
  uci: string,
  mover: Color,
): Evaluation | undefined {
  const listed = before.lines.find((line) => line.uci === uci);
  if (listed) return listed.evaluation;
  if (!after) return undefined;
  const last = before.lines.at(-1)!;
  const reached = after.lines[0].evaluation;
  // A list without moves (Maia's) ranks nothing.
  return last.uci && signed(last.evaluation, mover) < signed(reached, mover)
    ? last.evaluation
    : reached;
}

/**
 * White's score, negated for Black: higher is better for `mover`, like
 * `scoreFor`, but negating is exact, so the same swing in White's score is
 * the same loss for either side, even at a label's limit (in floats,
 * 0.06 - 0.01 is under 0.05 but 0.99 - 0.94 is over).
 */
const signed = ({ score }: Evaluation, mover: Color) => forSide(score, mover);
