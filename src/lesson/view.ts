/**
 * The facts the lesson screen shows about the position on the board: where
 * it stands in the guide, its candidate moves, the notes for the idea card,
 * which moves were guide moves, and a trap the line fell into (`lessonView`);
 * and which candidate the learner's pointer previews (`preview`). Facts and
 * the preview rule only: what a mode or switch hides is ./guidance.ts.
 *
 * `lessonView` replays the line, so the screen memoizes it on its inputs;
 * `preview` is cheap enough to run as the pointer moves.
 */
import type { SquareName } from 'chessops/types';

import { parsePositionKey } from '@/game/replay';
import type { Opponent } from '@/opponent/opponent';

import {
  ideaPosition,
  type Lesson,
  type LessonMove,
  type Note,
  type PositionKey,
  type Trap,
  type Uci,
  type Variation,
} from './lesson';
import {
  type Candidate,
  candidates,
  type GuidePosition,
  guideMove,
  guidePosition,
  lineKeys,
  lineVariation,
  opponentBand,
} from './select';

/**
 * A note to show, with the positions its ideas may be checked in (see
 * `ideaPosition`): `after` is the note's position, or the position after the
 * note's move; `before` is the position the move was played in, absent for
 * a position's own note.
 */
export interface ShownNote {
  readonly note: Note;
  readonly after: PositionKey;
  readonly before?: PositionKey;
}

/** A trap the line fell into: its tempting move and whole punishment are played. */
export interface LandedTrap {
  readonly trap: Trap;
  /** Where in the line the tempting move is: `line[ply]`. */
  readonly ply: number;
  /** The position the tempting move is played in. */
  readonly at: PositionKey;
  /** The position after the trap's last move, where it lands. */
  readonly end: PositionKey;
}

export interface LessonViewInput {
  readonly lesson: Lesson;
  /** Every move played, in UCI. */
  readonly line: readonly Uci[];
  /** How many moves of `line` the board shows. */
  readonly ply: number;
  /** Who plays the opponent: picks the popularity band. */
  readonly opponent: Opponent;
}

export interface LessonView {
  /** The position on the board. */
  readonly key: PositionKey;
  readonly learnerToMove: boolean;
  readonly place: GuidePosition['place'];
  /** The variation the board is in, the opening itself first (see `lineVariation`). */
  readonly variation: readonly Variation[];
  readonly candidates: readonly Candidate[];
  /** The idea card's notes: the move that led here, then the position. */
  readonly notes: readonly ShownNote[];
  /** The notes of the position the move that led here was played in. */
  readonly playedFrom: readonly ShownNote[];
  /**
   * Each move of `line` as the guide stores it where it was played, or
   * undefined where it wasn't a guide move. A book move's has `book: true`.
   */
  readonly guideMoves: readonly (LessonMove | undefined)[];
  /** The latest trap the line, up to the board, fell into. */
  readonly trap?: LandedTrap;
}

export function lessonView({ lesson, line, ply, opponent }: LessonViewInput): LessonView {
  const keys = lineKeys(line);
  const key = keys[ply];
  const guideMoves = line.map((uci, n) => guideMove(lesson, keys[n], uci));
  return {
    key,
    learnerToMove: parsePositionKey(key)!.turn === lesson.side,
    place: guidePosition(lesson, key).place,
    variation: lineVariation(lesson, keys.slice(0, ply + 1)),
    candidates: candidates(lesson, key, opponentBand(lesson, opponent)),
    notes: arrivalNotes(lesson, keys, guideMoves, ply),
    playedFrom: ply === 0 ? [] : positionNotes(lesson, keys[ply - 1]),
    guideMoves,
    trap: landedTrap(lesson, line.slice(0, ply), keys, guideMoves),
  };
}

/** What the learner points at: a board square, or a row of the candidate list. */
export type Pointer =
  | { readonly at: 'square'; readonly square: SquareName }
  | { readonly at: 'row'; readonly uci: Uci };

/**
 * A candidate move shown before it is played. `slide`: the board shows the
 * position after it (the piece slides there, leaving a ghost); otherwise the
 * board stays put, so the piece pointed at can still be picked up.
 */
export interface Preview {
  readonly candidate: Candidate;
  readonly slide: boolean;
  /** The move's notes, then those of the position it leads to. */
  readonly notes: readonly ShownNote[];
}

/**
 * The candidate `pointer` previews in `view`. A row previews its move. A
 * destination square previews the most common candidate landing there. A
 * piece's own square previews its most common candidate without sliding, so
 * the piece can still be dragged anywhere legal.
 */
export function preview(lesson: Lesson, view: LessonView, pointer: Pointer): Preview | undefined {
  const found = pointed(view.candidates, pointer);
  if (!found) return undefined;
  const { move, next } = found.candidate;
  return { ...found, notes: cardNotes(lesson, move, view.key, next) };
}

function pointed(shown: readonly Candidate[], pointer: Pointer) {
  if (pointer.at === 'row') {
    const candidate = shown.find(({ move }) => move.uci === pointer.uci);
    return candidate && { candidate, slide: true };
  }
  const landing = shown.find(({ to }) => to === pointer.square);
  if (landing) return { candidate: landing, slide: true };
  const leaving = shown.find(({ from }) => from === pointer.square);
  return leaving && { candidate: leaving, slide: false };
}

/** The idea card for a move from `before` to `after`: the move's notes, then the position's. */
function cardNotes(
  lesson: Lesson,
  move: LessonMove | undefined,
  before: PositionKey,
  after: PositionKey,
): ShownNote[] {
  return [...moveNotes(move, before, after), ...positionNotes(lesson, after)];
}

const moveNotes = (
  move: LessonMove | undefined,
  before: PositionKey,
  after: PositionKey,
): ShownNote[] => (move?.notes ?? []).map((note) => ({ note, before, after }));

const positionNotes = (lesson: Lesson, key: PositionKey): ShownNote[] =>
  (lesson.positions[key]?.notes ?? []).map((note) => ({ note, after: key }));

/** The idea card at `keys[ply]`: the notes of the move played into it, then its own. */
function arrivalNotes(
  lesson: Lesson,
  keys: readonly PositionKey[],
  guideMoves: readonly (LessonMove | undefined)[],
  ply: number,
): ShownNote[] {
  if (ply === 0) return positionNotes(lesson, keys[0]);
  return cardNotes(lesson, guideMoves[ply - 1], keys[ply - 1], keys[ply]);
}

/**
 * The latest trap `played` has gone through to its end. A trap belongs to the
 * position its idea is checked in; this reads the notes about each position
 * on the line: its own, and those of the moves played into and out of it.
 */
function landedTrap(
  lesson: Lesson,
  played: readonly Uci[],
  keys: readonly PositionKey[],
  guideMoves: readonly (LessonMove | undefined)[],
): LandedTrap | undefined {
  for (let ply = played.length - 1; ply >= 0; ply--) {
    const key = keys[ply];
    const notes = [
      ...arrivalNotes(lesson, keys, guideMoves, ply),
      ...moveNotes(guideMoves[ply], key, keys[ply + 1]),
    ];
    for (const shown of notes) {
      for (const trap of shown.note.ideas ?? []) {
        if (trap.type !== 'trap' || ideaPosition(trap, shown) !== key) continue;
        if (trap.moves.every((uci, n) => uci === played[ply + n])) {
          return { trap, ply, at: key, end: keys[ply + trap.moves.length] };
        }
      }
    }
  }
  return undefined;
}
