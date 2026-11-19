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
  lineKeys,
  linePlace,
  lineVariation,
  opponentBand,
} from './select';

/**
 * A note to show: `after` is the note's position, or the position after the
 * note's move, where its ideas hold; `before` is the position the move was
 * played in, absent for a position's own note.
 */
export interface ShownNote {
  readonly note: Note;
  readonly after: PositionKey;
  readonly before?: PositionKey;
}

/**
 * A trap the line fell into: its tempting move and the punishing reply are
 * played. The rest of its sequence is only played back.
 */
export interface LandedTrap {
  readonly trap: Trap;
  /** The note that holds the trap, for its card. The tempting move is played in its `after`. */
  readonly note: ShownNote;
  /** Where in the line the tempting move is: `line[ply]`. */
  readonly ply: number;
  /** The position after the punishing reply, where the trap lands. */
  readonly landed: PositionKey;
  /** How many of its moves the line plays, from the tempting move on; the line leaves it after them. */
  readonly movesPlayed: number;
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
  /** How many moves of the line the board shows. */
  readonly ply: number;
  readonly learnerToMove: boolean;
  /** Where the board's position stands in the guide (see `linePlace`). */
  readonly place: GuidePosition['place'];
  /** The latest ply, up to the board, whose position ends a guide line. */
  readonly lineEnd?: number;
  /** The variation the board is in, the opening itself first (see `lineVariation`). */
  readonly variation: readonly Variation[];
  /** The guide's moves, rare ones last (`Candidate.rare`); the list is `Guidance.candidates`. */
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
  /** The latest trap the line fell into, up to the board (see `landedTrap`). */
  readonly trap?: LandedTrap;
}

export function lessonView({ lesson, line, ply, opponent }: LessonViewInput): LessonView {
  const keys = lineKeys(line);
  const key = keys[ply];
  const guideMoves = line.map((uci, n) => guideMove(lesson, keys[n], uci));
  const places = keys
    .slice(0, ply + 1)
    .map((at, n) => linePlace(lesson, at, n ? guideMoves[n - 1] : undefined));
  const lineEnd = places.lastIndexOf('end');
  return {
    key,
    ply,
    learnerToMove: parsePositionKey(key)!.turn === lesson.side,
    place: places[ply],
    lineEnd: lineEnd === -1 ? undefined : lineEnd,
    variation: lineVariation(lesson, keys.slice(0, ply + 1)),
    candidates: candidates(lesson, key, opponentBand(lesson, opponent)),
    notes: arrivalNotes(lesson, keys, guideMoves, ply),
    playedFrom: ply === 0 ? [] : positionNotes(lesson, keys[ply - 1]),
    guideMoves,
    trap: landedTrap(lesson, line, ply, keys, guideMoves),
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

/** The position the board shows: a sliding preview's, after its move, or the game's `key`. */
export const shownKey = (key: PositionKey, preview?: Preview): PositionKey =>
  preview?.slide ? preview.candidate.next : key;

/**
 * The candidate `pointer` previews in `view`. A row previews its move, rare
 * or not. A destination square previews the most common candidate landing
 * there, and a piece's own square its most common candidate without sliding,
 * so the piece can still be dragged anywhere legal. A square takes a listed
 * candidate before a rare one, since rare ones come last in `view.candidates`.
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
 * A trap lands once its first two moves are played, the tempting move and
 * the punishing reply; a one-move trap at its only move.
 */
const LANDING_MOVES = 2;

/**
 * The latest trap `line` fell into within its first `shownMoves` moves (see
 * `LandedTrap`). A trap belongs to the position its idea is checked in, so
 * this reads the notes about each position on the line: its own, and those
 * of the move played into it. Traps that land alike (the same tempting move
 * and reply) part later: the one whose moves the whole line follows furthest
 * is the one it fell into, even with the board stepped back to the landing;
 * the first in note order while the line hasn't chosen.
 */
function landedTrap(
  lesson: Lesson,
  line: readonly Uci[],
  shownMoves: number,
  keys: readonly PositionKey[],
  guideMoves: readonly (LessonMove | undefined)[],
): LandedTrap | undefined {
  // How many of `trap`'s moves the line plays from `ply` on.
  const matchedMoves = (trap: Trap, ply: number) => {
    const n = trap.moves.findIndex((uci, step) => uci !== line[ply + step]);
    return n === -1 ? trap.moves.length : n;
  };
  for (let ply = shownMoves - 1; ply >= 0; ply--) {
    let landed: LandedTrap | undefined;
    let furthest = 0;
    for (const note of arrivalNotes(lesson, keys, guideMoves, ply)) {
      if (note.after !== keys[ply]) continue;
      for (const trap of note.note.ideas ?? []) {
        if (trap.type !== 'trap') continue;
        // A one-move trap lands at its only move.
        const landing = Math.min(LANDING_MOVES, trap.moves.length);
        if (ply + landing > shownMoves) continue;
        const matched = matchedMoves(trap, ply);
        // A tie keeps the first in note order.
        if (matched < landing || matched <= furthest) continue;
        furthest = matched;
        landed = { trap, note, ply, landed: keys[ply + landing], movesPlayed: matched };
      }
    }
    if (landed) return landed;
  }
  return undefined;
}
