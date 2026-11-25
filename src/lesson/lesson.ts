/**
 * The lesson file: everything Opening Night teaches about one opening, as one
 * static JSON file per opening in assets/lessons, read through `getLesson`.
 * `checkLesson` (./check.ts) tests every file; the importer
 * (scripts/import-study) runs it too, so a lesson that imports can't fail
 * in the app.
 *
 * The opening is one move tree keyed by position, never a list of fixed
 * lines: a position reached by two move orders is one entry, and its notes
 * apply however the learner got there. What the board can tell (which piece
 * stands on a square, whose turn it is, a move's SAN) is never stored.
 */
import type { Color, FileName, SquareName } from 'chessops/types';

/**
 * The format this code reads. A file with another number is refused.
 * 2: ideas lost `at: 'before'`; each holds in its note's position, or after its move.
 * 3: `source` became `sources`, since one lesson can draw on several, each with its license.
 * 4: a trap idea became a reference to a marked move (`MistakeIdea`, `LessonMove.mistake`).
 */
export const LESSON_FORMAT = 4;

/**
 * A move in UCI, like `g1f3`, with castling written as the king's two-square
 * move (`e1g1`), as `lineMove` in src/game/replay.ts records it.
 */
export type Uci = string;

/**
 * `I` is what a note can draw: a shipped lesson's `Idea`s, or the importer's
 * wider set before it turns traps into marked moves.
 */
export interface Lesson<I = Idea> {
  readonly format: typeof LESSON_FORMAT;
  /** Stable id, like `caro-kann`: what progress and links refer to. */
  readonly id: string;
  /** The opening's name, as the picker shows it. */
  readonly title: string;
  /** The side the learner plays: the study's side. */
  readonly side: Color;
  /** Where the lesson starts, as a full FEN (usually the initial position). */
  readonly start: string;
  /** Where the content comes from, for credit: at least one, the main source first. */
  readonly sources: readonly LessonSource[];
  /** What `LessonMove.games` counts; absent when no move has counts. */
  readonly popularity?: Popularity;
  /** Exactly one variation has no parent: the opening itself. */
  readonly variations: Readonly<Record<VariationId, Variation>>;
  readonly positions: Readonly<Record<PositionKey, LessonPosition<I>>>;
}

export interface LessonSource {
  readonly title: string;
  readonly author: string;
  readonly url: string;
  /**
   * The license the source's text comes under, when it has one. Text adapted
   * from a share-alike source (Wikibooks: CC BY-SA 4.0) stays under it, so its
   * credit must name it.
   */
  readonly license?: License;
}

/**
 * Whether `url` is on `domain` or one of its subdomains: `en.wikibooks.org` is
 * on `wikibooks.org`. The app runs it too: Expo installs a WHATWG `URL` on
 * native (expo/src/winter/runtime.native.ts), so `hostname` is there.
 */
export const onDomain = ({ hostname }: URL, domain: string) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

export interface License {
  /** Its short name, like `CC BY-SA 4.0`. */
  readonly name: string;
  readonly url: string;
}

/** The lichess opening explorer query behind `LessonMove.games`. */
export interface Popularity {
  /**
   * The explorer's rating bands, as each band's lowest rating, ascending
   * (like `[1000, 1200, 1400]`). The app maps the learner's setting onto them.
   */
  readonly ratingBands: readonly number[];
  /** The time controls counted, like `['blitz', 'rapid']`. */
  readonly speeds: readonly string[];
  /** When the counts were fetched, as an ISO date. */
  readonly date: string;
}

/**
 * Which entry of `LessonMove.games` counts for an opponent of `rating`: the
 * highest band starting at or below it (1500 reads the 1400 band), or the
 * lowest band for a rating below them all.
 */
export function ratingBandIndex(popularity: Popularity, rating: number): number {
  const index = popularity.ratingBands.findLastIndex((band) => band <= rating);
  return Math.max(index, 0);
}

/** `data` as a lesson, refusing a file written in another format. */
export function readLesson(data: unknown): Lesson {
  const format = (data as { format?: unknown } | null)?.format;
  if (format !== LESSON_FORMAT) {
    throw new Error(`Lesson format ${String(format)} is not ${LESSON_FORMAT}; update the app`);
  }
  // Trusted beyond the format: checkLesson tests every shipped file.
  return data as Lesson;
}

/** A variation's id, like `advance-c5`. */
export type VariationId = string;

/** A named subtree of the opening, like "Advance Variation". */
export interface Variation {
  /**
   * A name that stands alone: a sub-line's starts with its group's, as in
   * "Advance Variation: Tal Variation". Where the group shows too, the app
   * drops it (`nameWithin` in select.ts).
   */
  readonly name: string;
  /** The variation this one branches from; absent for the opening itself. */
  readonly parent?: VariationId;
}

/** A position's FEN without the move counters, so transpositions meet (`positionKey`). */
export type PositionKey = string;

export interface LessonPosition<I = Idea> {
  /**
   * The variation this position belongs to: the idea card's subtitle. Where
   * the study reaches one position in several chapters, the first chapter's.
   */
  readonly variation: VariationId;
  /**
   * The guide's moves here for the side to move (the candidate moves), book
   * moves first, then in study order. Empty when the guide stops here. A move
   * whose resulting position has no entry in `Lesson.positions` leads beyond
   * the guide.
   */
  readonly moves: readonly LessonMove<I>[];
  /** What is worth knowing about this position however it was reached. */
  readonly notes?: readonly Note<I>[];
  /**
   * How many lichess games reached this position, one count per entry of
   * `Lesson.popularity.ratingBands`, in the same order: the explorer's own
   * total, which counts moves the guide doesn't list. Absent means not
   * measured, not zero.
   */
  readonly games?: readonly number[];
}

export interface LessonMove<I = Idea> {
  readonly uci: Uci;
  /**
   * The guide recommends this move, or the importer picked it where the guide recommends none.
   * Only the learner's moves are book moves.
   */
  readonly book?: boolean;
  /** How the study rates this move among the good ones (a "choice guide"). */
  readonly risk?: Risk;
  /**
   * How many lichess games played this move here, one count per entry of
   * `Lesson.popularity.ratingBands`, in the same order. Absent means not
   * measured, not zero.
   */
  readonly games?: readonly number[];
  /** What this move does: shown when it is previewed or played. */
  readonly notes?: readonly Note<I>[];
  /** This move is a mistake the other side can punish: a trap for the side that plays it. */
  readonly mistake?: Mistake;
}

/**
 * A marked mistake: the move it marks, then its stored `line` or else the
 * guide's moves after it (`mistakeLine` in ./mistakes.ts), are the line where
 * the other side punishes it. Read by the side that plays it, a trap; by the
 * other, an opportunity. Each field is absent until measured: a trap migrated
 * from a guide has only its verdict, and its `line` where the guide would
 * play another.
 */
export interface Mistake {
  /**
   * How much the move gives away: the mover's expected score (0 to 1) before
   * it, less after it, by Stockfish's full search. At least `MISTAKE_LOSS`
   * (src/analysis/quality.ts).
   */
  readonly cost?: number;
  /**
   * What knowing the punishment is worth, one value per entry of
   * `Lesson.popularity.ratingBands` (`gainIfKnown` in src/opportunity/gain.ts).
   */
  readonly gain?: readonly number[];
  /** A short title for the list of opportunities. */
  readonly name?: string;
  /**
   * The guide's verdict on the line's last position. `losesMaterial`: the
   * side that errs ends at least two points worse off, or mated.
   */
  readonly verdict?: Evaluation | 'losesMaterial';
  /**
   * The moves of the line after this one, each a guide move at its position,
   * stored only where the guide's choice rule (`guideOrder` in ./mistakes.ts)
   * from this move would play another line, or go on past its end; absent,
   * the line is that rule's. Example: a marked 15...Qe7 with the line
   * 16.Ng5 Qf6 17.Qh7#, where the guide's most played reply to 16.Ng5 is 16...Qxg5.
   */
  readonly line?: readonly Uci[];
}

export const RISKS = ['safe', 'balanced', 'sharp'] as const;
export type Risk = (typeof RISKS)[number];

/** One study comment, rewritten (or a book move's idea, `generated`): a short sentence and what can be drawn. */
export interface Note<I = Idea> {
  /** The sentence shown, at most `MAX_NOTE_WORDS` words, in plain language. */
  readonly text: string;
  /** The study's own words, shown behind "more". */
  readonly original?: string;
  /**
   * Written by the importer's AI where no guide explains a book move
   * (scripts/import-study/explain), so no study author stands behind it.
   * The app says so; such a note has no `original`.
   */
  readonly generated?: true;
  /**
   * The AI model that wrote the text and chose its ideas (the importer's own
   * ideas on the same move may join them), on every note an AI step of the
   * importer wrote: a rewritten comment, or a `generated` note. The app
   * credits it on a `generated` note only, since a rewritten comment is the
   * study's analysis. Absent on notes no model wrote.
   */
  readonly model?: AiModel;
  /** What the board draws; none means the note is text only. */
  readonly ideas?: readonly I[];
}

export const MAX_NOTE_WORDS = 20;

/**
 * The AI models the importer asks (scripts/import-study/convert/claude.ts),
 * each with the name the app credits. Add a new model here before importing
 * with it; keep an old one while any lesson file still cites it.
 */
export const AI_MODELS = {
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-5-5': 'Claude Opus 5.5',
  'claude-fable-5-2': 'Claude Fable 5.2',
} as const;
export type AiModel = keyof typeof AI_MODELS;

/** What a note shows: something drawn on the board, only an evaluation badge, or text alone. */
export type NoteShows = 'drawn' | 'badge' | 'text';

export const noteShows = <I extends { readonly type: string }>(
  ideas: readonly I[] = [],
): NoteShows =>
  ideas.some((idea) => idea.type !== 'evaluation') ? 'drawn' : ideas.length > 0 ? 'badge' : 'text';

/**
 * Something the board can draw. An idea in a position's notes is checked in
 * that position, and one in a move's notes in the position after the move.
 */
export type Idea =
  Purpose | Pressure | Plan | Threat | MistakeIdea | Line | Structure | Imbalance | EvaluationIdea;

/** What one piece does to its targets. The piece is the one on `from`. */
export interface Purpose {
  readonly type: 'purpose';
  readonly from: SquareName;
  readonly relation: Relation;
  readonly targets: readonly SquareName[];
}

/**
 * - `attacks`: an enemy piece stands on the target, and the piece attacks it.
 * - `defends`: a friendly piece stands on the target, and the piece attacks it.
 * - `controls`: the piece attacks the target square, whatever is on it.
 * - `checks`: the target is the enemy king, and the piece attacks it.
 * - `pins`: the piece is a line piece attacking an enemy piece on the target,
 *   and the next piece behind it is that side's king or worth more.
 * - `blocks`: the piece shields the target from an enemy line piece, or stands
 *   right in front of an enemy pawn on the target.
 * - `aims`: the piece is a line piece whose line reaches the target once the
 *   pieces between are gone, and at least one piece is between ("x-ray").
 */
export const RELATIONS = [
  'attacks',
  'defends',
  'controls',
  'checks',
  'pins',
  'blocks',
  'aims',
] as const;
export type Relation = (typeof RELATIONS)[number];

/**
 * Several pieces of `side` bearing on one target, against its defenders.
 * Pieces lined up behind each other on one line (a battery) all count.
 */
export interface Pressure {
  readonly type: 'pressure';
  readonly side: Color;
  readonly target: SquareName;
  /** Every piece of `side` bearing on the target: at least two. */
  readonly attackers: readonly SquareName[];
  /** Every piece of the other side bearing on the target. */
  readonly defenders: readonly SquareName[];
}

/**
 * Moves one side wants, in order, ignoring the other side's replies. Routes
 * are applied one after another on one board; the other side's pieces stay.
 */
export interface Plan {
  readonly type: 'plan';
  readonly side: Color;
  readonly routes: readonly Route[];
  /** Squares the plan aims for: each a route's end or attacked from one. */
  readonly goals?: readonly SquareName[];
}

export interface Route {
  readonly from: SquareName;
  readonly to: SquareName;
  /**
   * At most how many of its own moves the piece needs, 1 to 4 (default 1). It
   * may capture only on `to`. A king route of two squares from its starting
   * square is castling.
   */
  readonly moves?: number;
}

/**
 * What `side` does next if it is ignored. When `side` is not to move, the
 * threat is read as if the other side passed.
 */
export interface Threat {
  readonly type: 'threat';
  readonly side: Color;
  readonly move: Uci;
  /**
   * The study's move for the other side against the threat: played now when
   * that side is to move (prevention), or after the threat when `side` is to
   * move (reply). Only its legality is checked, so show it as advice.
   */
  readonly answer?: Uci;
}

/**
 * A trap the note warns of: `move`, the side to move's marked mistake
 * (`LessonMove.mistake`), which the guide lists here. The marker and the
 * guide's moves after it hold the rest (`mistakeLine` in ./mistakes.ts).
 */
export interface MistakeIdea {
  readonly type: 'mistake';
  readonly move: Uci;
}

/** A short line with both sides' moves that is not a trap, and its verdict. */
export interface Line {
  readonly type: 'line';
  readonly moves: readonly Uci[];
  readonly verdict: Evaluation;
}

/** Pawn-structure features of `side`'s pawns (or files half-open for it). */
export interface Structure {
  readonly type: 'structure';
  readonly side: Color;
  readonly features: readonly StructureFeature[];
}

/** The rules for each kind are in ./pawns.ts. */
export type StructureFeature =
  | {
      readonly kind:
        'isolatedPawn' | 'backwardPawn' | 'passedPawn' | 'pawnChain' | 'weakSquare' | 'outpost';
      readonly squares: readonly SquareName[];
    }
  | {
      readonly kind: 'doubledPawns' | 'openFile' | 'halfOpenFile' | 'pawnMajority';
      readonly files: readonly FileName[];
    }
  /** A pawn move that strikes at an enemy pawn. */
  | { readonly kind: 'pawnBreak'; readonly move: Uci };

/**
 * An imbalance in `side`'s favor: both bishops against fewer, more material,
 * or more space (more squares in the opponent's half its pawns attack, see
 * `spaceSquares` in ./pawns.ts).
 */
export interface Imbalance {
  readonly type: 'imbalance';
  readonly side: Color;
  readonly kind: ImbalanceKind;
}

export const IMBALANCE_KINDS = ['bishopPair', 'material', 'space'] as const;
export type ImbalanceKind = (typeof IMBALANCE_KINDS)[number];

/** Who is better, as the study judges it. */
export interface EvaluationIdea {
  readonly type: 'evaluation';
  readonly value: Evaluation;
}

/** The study's evaluation glyphs: = ⩲ ± +- ⩱ ∓ -+. */
export const EVALUATIONS = [
  'equal',
  'whiteSlightly',
  'whiteClearly',
  'whiteWinning',
  'blackSlightly',
  'blackClearly',
  'blackWinning',
] as const;
export type Evaluation = (typeof EVALUATIONS)[number];
