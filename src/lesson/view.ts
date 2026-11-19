/**
 * The facts the lesson screen shows about the position on the board: where
 * it stands in the guide, its candidate moves, the notes for the idea card,
 * which moves were book moves, Stockfish's view, a trap walked into, and the
 * move being previewed. Facts only: what a mode or switch hides is decided
 * in ./guidance.ts.
 */
import type { Color, SquareName } from 'chessops/types';

import type { Opponent } from '@/opponent/opponent';

import type { Idea, Lesson, LessonMove, Note, PositionKey, Trap, Uci, Variation } from './lesson';
import {
  type Candidate,
  candidates,
  type GuidePosition,
  guidePosition,
  lineKeys,
  opponentBand,
  variationPath,
} from './select';

/** What the learner points at: a board square, or a row of the candidate list. */
export type Pointer =
  | { readonly at: 'square'; readonly square: SquareName }
  | { readonly at: 'row'; readonly uci: Uci };

/**
 * A note to show, with the positions its ideas are checked in. A position's
 * note (`on: 'position'`) has `before` equal to `after`. A move's note
 * (`on: 'move'`) is about the move from `before` to `after`; each of its
 * ideas is checked in `after`, or in `before` when the idea says
 * `at: 'before'`.
 */
export interface ShownNote {
  readonly note: Note;
  readonly on: 'position' | 'move';
  readonly before: PositionKey;
  readonly after: PositionKey;
}

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

/** A trap whose tempting move the line has played. */
export interface WalkedTrap {
  readonly trap: Trap;
  /** Where in the line the tempting move is: `line[ply]`. */
  readonly ply: number;
  /** How many of the trap's moves the line has played so far, from 1 to all. */
  readonly played: number;
}

/** Stockfish's view of the shown position, as far as it has arrived. */
export interface EngineView {
  readonly best?: Uci;
  /** Its top three moves, best first. */
  readonly top?: readonly Uci[];
}

export interface LessonViewInput {
  readonly lesson: Lesson;
  /** Every move played, in UCI. */
  readonly line: readonly Uci[];
  /** How many moves of `line` the board shows. */
  readonly ply: number;
  /** Who plays the opponent: picks the popularity band. */
  readonly opponent: Opponent;
  readonly engine?: EngineView;
  readonly pointer?: Pointer;
}

export interface LessonView {
  /** The position on the board. */
  readonly key: PositionKey;
  readonly turn: Color;
  readonly learnerToMove: boolean;
  readonly place: GuidePosition['place'];
  /**
   * The variation the board is in, the opening itself first: the shown
   * position's, or beyond the guide, that of the last guide position the
   * line passed.
   */
  readonly variation: readonly Variation[];
  readonly candidates: readonly Candidate[];
  /** The idea card's notes: the move that led here, then the position. */
  readonly notes: readonly ShownNote[];
  readonly preview?: Preview;
  /**
   * Each move of `line` as the guide stores it at the position it was played
   * in, or undefined where it wasn't a guide move. A book move's entry has
   * `book: true`.
   */
  readonly guideMoves: readonly (LessonMove | undefined)[];
  readonly best?: Uci;
  readonly top: readonly Uci[];
  /** The latest trap the line up to the board has walked into. */
  readonly trap?: WalkedTrap;
}

export function lessonView({
  lesson,
  line,
  ply,
  opponent,
  engine,
  pointer,
}: LessonViewInput): LessonView {
  const keys = lineKeys(line);
  const key = keys[ply];
  const guide = guidePosition(lesson, key);
  const shown = candidates(lesson, key, opponentBand(lesson, opponent));
  const guideMoves = line.map((uci, n) =>
    lesson.positions[keys[n]]?.moves.find((move) => move.uci === uci),
  );
  const turn = key.split(' ')[1] === 'w' ? 'white' : 'black';
  const lastGuideKey = keys.slice(0, ply + 1).findLast((at) => lesson.positions[at]);
  const variation = lastGuideKey
    ? variationPath(lesson, lesson.positions[lastGuideKey].variation).map(
        (id) => lesson.variations[id],
      )
    : [];

  return {
    key,
    turn,
    learnerToMove: turn === lesson.side,
    place: guide.place,
    variation,
    candidates: shown,
    notes: [...moveNotes(guideMoves[ply - 1], keys[ply - 1], key), ...positionNotes(lesson, key)],
    preview: pointer && preview(lesson, shown, key, pointer),
    guideMoves,
    best: engine?.best,
    top: engine?.top ?? [],
    trap: walkedTrap(lesson, line.slice(0, ply), keys, guideMoves),
  };
}

/**
 * The candidate `pointer` previews. A row previews its move. A destination
 * square previews the most common candidate landing there. A piece's own
 * square previews its most common candidate without sliding, so the piece
 * can still be dragged anywhere legal.
 */
export function pointed(
  shown: readonly Candidate[],
  pointer: Pointer,
): Pick<Preview, 'candidate' | 'slide'> | undefined {
  if (pointer.at === 'row') {
    const candidate = shown.find(({ move }) => move.uci === pointer.uci);
    return candidate && { candidate, slide: true };
  }
  const landing = shown.find(({ to }) => to === pointer.square);
  if (landing) return { candidate: landing, slide: true };
  const leaving = shown.find(({ from }) => from === pointer.square);
  return leaving && { candidate: leaving, slide: false };
}

function preview(
  lesson: Lesson,
  shown: readonly Candidate[],
  key: PositionKey,
  pointer: Pointer,
): Preview | undefined {
  const found = pointed(shown, pointer);
  if (!found) return undefined;
  const { candidate } = found;
  return {
    ...found,
    notes: [
      ...moveNotes(candidate.move, key, candidate.next),
      ...positionNotes(lesson, candidate.next),
    ],
  };
}

function moveNotes(
  move: LessonMove | undefined,
  before: PositionKey,
  after: PositionKey,
): ShownNote[] {
  return (move?.notes ?? []).map((note) => ({ note, on: 'move', before, after }));
}

function positionNotes(lesson: Lesson, key: PositionKey): ShownNote[] {
  return (lesson.positions[key]?.notes ?? []).map((note) => ({
    note,
    on: 'position',
    before: key,
    after: key,
  }));
}

/**
 * The latest trap whose tempting move `played` contains. A trap belongs to the
 * position its ideas are checked in: a position's own notes, the notes of the
 * move that reached it, and `at: 'before'` notes of the moves leaving it.
 */
function walkedTrap(
  lesson: Lesson,
  played: readonly Uci[],
  keys: readonly PositionKey[],
  guideMoves: readonly (LessonMove | undefined)[],
): WalkedTrap | undefined {
  for (let ply = played.length - 1; ply >= 0; ply--) {
    const entry = lesson.positions[keys[ply]];
    const ideas = [
      ...ideasOf(entry?.notes),
      ...ideasOf(guideMoves[ply - 1]?.notes).filter((idea) => idea.at !== 'before'),
      ...(entry?.moves ?? []).flatMap((move) =>
        ideasOf(move.notes).filter((idea) => idea.at === 'before'),
      ),
    ];
    for (const trap of ideas) {
      if (trap.type !== 'trap' || trap.moves[0] !== played[ply]) continue;
      const after = played.slice(ply);
      const length = trap.moves.findIndex((uci, n) => uci !== after[n]);
      return { trap, ply, played: length === -1 ? trap.moves.length : length };
    }
  }
  return undefined;
}

const ideasOf = (notes: readonly Note[] | undefined): Idea[] =>
  notes?.flatMap((note) => note.ideas ?? []) ?? [];
