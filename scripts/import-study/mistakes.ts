/**
 * Turns the traps a study's notes draw into marked guide moves (format:
 * src/lesson/lesson.ts). Every move of a trap's line goes into the guide
 * tree where it isn't there yet, the learner's punishing moves as book moves
 * where the guide books no other; its first move gets the marker
 * (`LessonMove.mistake`) with the study's verdict and line; and its note
 * stays where it is, naming the marked move (`MistakeIdea`). `settleMistakes`,
 * once nothing else changes the tree, keeps each stored line only where the
 * guide's choice rule (`mistakeLine`) would play another, and reports each
 * trap whose line came out other than the study wrote it.
 */
import type { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';

import { lineSans, numberedLine, parsePositionKey, positionKey } from '@/game/replay';
import { BOOK_MARK, checkIdea, trapProblem, verdictProblem } from '@/lesson/check';
import type {
  Idea,
  Lesson,
  LessonMove,
  LessonPosition,
  Mistake,
  MistakeIdea,
  Note,
  PositionKey,
  Uci,
  VariationId,
} from '@/lesson/lesson';
import { isGuideLine, markId, mistakeLine } from '@/lesson/mistakes';
import { sameLine } from '@/lesson/openings';
import { guideMove } from '@/lesson/select';

import { linesTo, sans, startPly, withoutMarks } from './engineCheck';
import { played } from './study';
import { namedMoves, plainSan } from './text';
import { allMoves } from './transpositions';

/**
 * A trap as a study draws it: the side to move plays the first move and
 * falls in. `verdict` judges the final position; `losesMaterial` means that
 * side ends at least two points worse off, or mated. The importer's own
 * idea: `markMistakes` turns each into a marked move.
 */
export interface StudyTrap {
  readonly type: 'trap';
  readonly moves: readonly Uci[];
  readonly verdict: NonNullable<Mistake['verdict']>;
}

/** What a study's note can draw before its traps become marked moves. */
export type StudyIdea = Exclude<Idea, MistakeIdea> | StudyTrap;
export type StudyNote = Note<StudyIdea>;
export type StudyLesson = Lesson<StudyIdea>;

/** `checkIdea` for a study's idea, a trap by `trapProblem`. */
export const checkStudyIdea = (idea: StudyIdea, pos: Chess): string | undefined =>
  idea.type === 'trap' ? trapProblem(pos, idea.moves, idea.verdict) : checkIdea(idea, pos);

/** A trap as the study wrote it, at the position it starts, for `settleMistakes` to report on. */
export interface WrittenTrap {
  readonly at: PositionKey;
  readonly moves: readonly Uci[];
  readonly text: string;
}

type Entry = { variation: VariationId; moves: LessonMove<StudyIdea>[]; notes?: StudyNote[] };

/**
 * `lesson` with each trap a marked move, and the traps as the study wrote them.
 * Only a trap that holds a mark writes its moves into the tree: of two with one
 * first move, the first in file order; and with `keep`, only marks it names (by
 * `markId`), whose notes go with the rest. Example: a rerun keeping only the
 * marks that survived the engine check adds no moves for the traps it overruled.
 */
export function markMistakes(
  lesson: StudyLesson,
  keep?: ReadonlySet<string>,
): { lesson: Lesson; traps: WrittenTrap[] } {
  const positions: Record<PositionKey, Entry> = {};
  for (const [key, entry] of Object.entries(lesson.positions))
    positions[key] = { ...entry, moves: [...entry.moves], notes: entry.notes && [...entry.notes] };
  const traps: WrittenTrap[] = [];
  const marked = new Set<string>();
  const skipped = new Set<string>();
  for (const { at, variation, trap, note } of studyTraps(lesson)) {
    traps.push({ at, moves: trap.moves, text: note.text });
    const id = markId(at, trap.moves[0]);
    if (keep && !keep.has(id)) skipped.add(id);
    if (marked.has(id) || skipped.has(id)) continue;
    marked.add(id);
    placeTrap(positions, lesson.side, at, variation, trap.moves);
    const { moves } = positions[at];
    const first = moves.findIndex(({ uci }) => uci === trap.moves[0]);
    // A book move gets the mark too, since the engine check may unbook it; `settleMistakes` drops
    // one still booked.
    moves[first] = {
      ...moves[first],
      mistake: { verdict: trap.verdict, line: trap.moves.slice(1) },
    };
  }
  const marking: Record<PositionKey, LessonPosition> = {};
  for (const [key, entry] of Object.entries(positions)) {
    // Spread first, so each key keeps its place in the file.
    marking[key] = {
      ...entry,
      moves: entry.moves.map((move) =>
        move.notes ? { ...move, notes: move.notes.map(namingMarks) } : (move as LessonMove),
      ),
      ...(entry.notes && { notes: entry.notes.map(namingMarks) }),
    } as LessonPosition;
  }
  return { lesson: withoutMarks({ ...lesson, positions: marking }, skipped).lesson, traps };
}

/**
 * `note` with each trap it draws a reference to that trap's mark, which
 * `markMistakes` puts on every trap's first move; two traps with one first
 * move name one mark.
 */
function namingMarks(note: StudyNote): Note {
  const ideas = (note.ideas ?? []).map((idea): Idea =>
    idea.type === 'trap' ? { type: 'mistake', move: idea.moves[0] } : idea,
  );
  const unique = ideas.filter(
    (idea, i) =>
      idea.type !== 'mistake' ||
      ideas.findIndex((other) => other.type === 'mistake' && other.move === idea.move) === i,
  );
  const { ideas: _ideas, ...rest } = note;
  return unique.length ? { ...rest, ideas: unique } : rest;
}

/**
 * Each trap the notes draw, in file order: where it starts (a position note's
 * position, or the position after a note's move), that position's variation,
 * and its note.
 */
function studyTraps(lesson: StudyLesson) {
  const found: { at: PositionKey; variation: VariationId; trap: StudyTrap; note: StudyNote }[] = [];
  const add = (at: PositionKey, variation: VariationId, notes: readonly StudyNote[] = []) => {
    for (const note of notes)
      for (const idea of note.ideas ?? [])
        if (idea.type === 'trap') found.push({ at, variation, trap: idea, note });
  };
  for (const [key, entry] of Object.entries(lesson.positions))
    add(key, entry.variation, entry.notes);
  for (const { key, move, after } of allMoves(lesson))
    add(after, lesson.positions[key].variation, move.notes);
  return found;
}

/**
 * Writes `moves`, a trap from `at`, into the guide tree, each where it isn't
 * there yet: the learner's punishing moves as book moves, as Act III writes
 * them (docs/plans/opportunities.md), where the guide books no other move;
 * every other move as an ordinary one. New positions take `variation`.
 * Example: in Black's lesson, the trap 6.Qxd5? Qxc1#, where the guide has
 * 6...Qxc1# only as a side line's move, books 6...Qxc1#.
 */
function placeTrap(
  positions: Record<PositionKey, Entry>,
  side: Color,
  at: PositionKey,
  variation: VariationId,
  moves: readonly Uci[],
) {
  let pos = parsePositionKey(at)!;
  const erring = pos.turn;
  for (const uci of moves) {
    const entry = (positions[positionKey(pos)] ??= { variation, moves: [] });
    const book =
      pos.turn === side &&
      pos.turn !== erring &&
      !entry.moves.some((move) => move.book && move.uci !== uci);
    const i = entry.moves.findIndex((move) => move.uci === uci);
    if (i === -1) entry.moves.push(book ? { uci, book } : { uci });
    else if (book) entry.moves[i] = { ...entry.moves[i], book };
    pos = played(pos, uci);
  }
}

/** A trap whose line in the lesson differs from the study's, for a person to read. */
export interface ChangedTrap {
  /** The moves to where it starts, numbered: `1.e4 c6 2.d4`. */
  readonly line: string;
  readonly study: string;
  readonly shown: string;
  /** Moves the note names from the study's line that the shown line no longer plays. */
  readonly offLine: readonly string[];
}

/** A trap that lost its mark, and why where this step took it. */
export interface UnmarkedTrap {
  readonly line: string;
  readonly study: string;
  readonly reason?: string;
}

/** The marks in `lesson`, by `markId`. */
export function markIds(lesson: Lesson): Set<string> {
  return new Set(
    Object.entries(lesson.positions).flatMap(([key, { moves }]) =>
      moves.filter((move) => move.mistake).map((move) => markId(key, move.uci)),
    ),
  );
}

/**
 * `lesson`, once nothing else changes its tree, with each mark's stored line
 * left only where the guide's choice rule would play another, and each mark
 * on a book move, or whose verdict its line contradicts by the checker's rule
 * (`trapProblem`), taken off with the notes that name it; and how each of `traps` came out:
 * the ones whose line differs from the study's, and those that lost their
 * mark here or earlier.
 */
export function settleMistakes(
  lesson: Lesson,
  traps: readonly WrittenTrap[],
): { lesson: Lesson; changed: ChangedTrap[]; unmarked: UnmarkedTrap[] } {
  const fitted = {
    ...lesson,
    positions: mapMoves(lesson, (move, key) =>
      fitLine(lesson, key, move, mistakeLine(lesson, key, move)),
    ),
  };
  const refused = new Map<string, string>();
  for (const [key, { moves }] of Object.entries(fitted.positions)) {
    for (const move of moves) {
      if (!move.mistake) continue;
      const { verdict } = move.mistake;
      const problem = move.book
        ? BOOK_MARK
        : verdict && verdictProblem(fitted, parsePositionKey(key)!, move, verdict);
      if (problem) refused.set(markId(key, move.uci), problem);
    }
  }
  // Taking a mark off can change the guide's choice where the line it was on goes (guideOrder
  // skips marked moves), so each kept mark's line is fitted again to the tree without it.
  const unrefused = withoutMarks(fitted, new Set(refused.keys())).lesson;
  const settled = {
    ...unrefused,
    positions: mapMoves(unrefused, (move, key) =>
      fitLine(unrefused, key, move, mistakeLine(fitted, key, move)),
    ),
  };
  const lines = linesTo(settled);
  const changed: ChangedTrap[] = [];
  const unmarked: UnmarkedTrap[] = [];
  for (const { at, moves, text } of traps) {
    const route = lines.get(at)?.line ?? [];
    const pos = parsePositionKey(at)!;
    const firstPly = startPly(settled) + route.length;
    const line = sans(settled, route);
    const study = numberedLine(lineSans(moves, pos), firstPly);
    const move = guideMove(settled, at, moves[0]);
    if (!move?.mistake) {
      const reason = refused.get(markId(at, moves[0]));
      unmarked.push({ line, study, ...(reason && { reason }) });
      continue;
    }
    const shownMoves = mistakeLine(settled, at, move);
    if (sameLine(shownMoves, moves)) continue;
    const shownSans = lineSans(shownMoves, pos).map(plainSan);
    const studySans = lineSans(moves, pos).map(plainSan);
    const offLine = namedMoves(text)
      .map(({ san }) => san)
      .filter((san) => studySans.includes(san) && !shownSans.includes(san));
    changed.push({
      line,
      study,
      shown: numberedLine(lineSans(shownMoves, pos), firstPly),
      offLine,
    });
  }
  return { lesson: settled, changed, unmarked };
}

/**
 * `after` with each mark's line as `before` has it, which a change to the
 * tree's counts (popularity) would otherwise move where the line is the
 * guide's choice. Example: a mark whose line followed the only reply then
 * counted keeps it, stored, once another reply turns out more played.
 */
export function keepMistakeLines(before: Lesson, after: Lesson): Lesson {
  return {
    ...after,
    positions: mapMoves(after, (move, key) => {
      const was = guideMove(before, key, move.uci);
      return was?.mistake ? fitLine(after, key, move, mistakeLine(before, key, was)) : move;
    }),
  };
}

/**
 * `move`, a mark at `key` whose line is `line`, with that line stored only
 * where the guide's choice rule doesn't give it.
 */
function fitLine(
  lesson: Lesson,
  key: PositionKey,
  move: LessonMove,
  line: readonly Uci[],
): LessonMove {
  if (!move.mistake) return move;
  const { line: _line, ...mark } = move.mistake;
  return {
    ...move,
    mistake: isGuideLine(lesson, key, line) ? mark : { ...mark, line: line.slice(1) },
  };
}

/** `lesson`'s positions with each move as `edit` makes it. */
function mapMoves(
  lesson: Lesson,
  edit: (move: LessonMove, key: PositionKey) => LessonMove,
): Record<PositionKey, LessonPosition> {
  return Object.fromEntries(
    Object.entries(lesson.positions).map(([key, entry]) => [
      key,
      { ...entry, moves: entry.moves.map((move) => edit(move, key)) },
    ]),
  );
}
