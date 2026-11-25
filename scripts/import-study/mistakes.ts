/**
 * Turns the traps a study's notes draw into marked guide moves (format:
 * src/lesson/lesson.ts). A trap's first move gets the marker
 * (`LessonMove.mistake`) with the study's verdict; its later moves go into
 * the guide tree until the guide goes its own way, where the trap's line
 * follows the guide (`mistakeLine`), and the learner's punishing moves among
 * them become book moves; and its note stays where it is, naming the marked
 * move (`MistakeIdea`).
 * `settleMistakes`, once nothing else changes the tree, stores each line's
 * length only where the guide goes on past it, and reports each trap whose
 * line came out other than the study wrote it.
 */
import type { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';

import { lineSans, numberedLine, parsePositionKey, playMove, positionKey } from '@/game/replay';
import { checkIdea, trapProblem } from '@/lesson/check';
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
import { mistakeLine } from '@/lesson/mistakes';

import { linesTo, markId } from './engineCheck';
import { namedMoves, plainSan } from './text';

/**
 * A trap as a study draws it: the side to move plays the first move and
 * falls in. `verdict` judges the final position; `losesMaterial` means that
 * side ends at least two points worse off, or mated. The importer's own
 * idea: `markMistakes` turns each into a marked move.
 */
export interface Trap {
  readonly type: 'trap';
  readonly moves: readonly Uci[];
  readonly verdict: NonNullable<Mistake['verdict']>;
}

/** What a study's note can draw before its traps become marked moves. */
export type StudyIdea = Exclude<Idea, MistakeIdea> | Trap;
export type StudyNote = Note<StudyIdea>;
export type StudyLesson = Lesson<StudyIdea>;

/** `checkIdea` for a study's idea, a trap by `trapProblem`. */
export const checkStudyIdea = (idea: StudyIdea, pos: Chess): string | undefined =>
  idea.type === 'trap' ? trapProblem(pos, idea.moves, idea.verdict) : checkIdea(idea, pos);

/** A trap as the study wrote it, at the position it starts, for `settleMistakes` to report on. */
export interface StudyTrap {
  readonly at: PositionKey;
  readonly moves: readonly Uci[];
  readonly text: string;
}

type Entry = { variation: VariationId; moves: LessonMove<StudyIdea>[]; notes?: StudyNote[] };

/** `lesson` with each trap a marked move, and the traps as the study wrote them. */
export function markMistakes(lesson: StudyLesson): { lesson: Lesson; traps: StudyTrap[] } {
  const positions: Record<PositionKey, Entry> = {};
  for (const [key, entry] of Object.entries(lesson.positions))
    positions[key] = { ...entry, moves: [...entry.moves], notes: entry.notes && [...entry.notes] };
  const traps: StudyTrap[] = [];
  for (const { at, variation, trap, note } of studyTraps(lesson)) {
    placeTrap(positions, lesson.side, at, variation, trap.moves);
    traps.push({ at, moves: trap.moves, text: note.text });
    const { moves } = positions[at];
    const first = moves.findIndex(({ uci }) => uci === trap.moves[0]);
    // A move the guide recommends is no mistake, and the checker refuses the mark: the trap goes.
    if (moves[first].book || moves[first].mistake) continue;
    moves[first] = {
      ...moves[first],
      mistake: { verdict: trap.verdict, plies: trap.moves.length },
    };
  }
  const marked = (at: PositionKey, uci: Uci) =>
    !!positions[at]?.moves.find((move) => move.uci === uci)?.mistake;
  const noteAt =
    (at: PositionKey) =>
    (note: StudyNote): Note => {
      const ideas = (note.ideas ?? []).flatMap((idea): Idea[] => {
        if (idea.type !== 'trap') return [idea];
        return marked(at, idea.moves[0]) ? [{ type: 'mistake', move: idea.moves[0] }] : [];
      });
      // Two traps a note draws with one first move name one mistake.
      const unique = ideas.filter(
        (idea, i) =>
          idea.type !== 'mistake' ||
          ideas.findIndex((other) => other.type === 'mistake' && other.move === idea.move) === i,
      );
      const { ideas: _ideas, ...rest } = note;
      return unique.length ? { ...rest, ideas: unique } : rest;
    };
  const marking: Record<PositionKey, LessonPosition> = {};
  for (const [key, entry] of Object.entries(positions)) {
    const pos = parsePositionKey(key)!;
    // Spread first, so each key keeps its place in the file; what has no notes holds no trap.
    marking[key] = {
      ...entry,
      moves: entry.moves.map((move) => {
        if (!move.notes) return move as LessonMove;
        const after = pos.clone();
        playMove(after, move.uci);
        return { ...move, notes: move.notes.map(noteAt(positionKey(after))) };
      }),
      ...(entry.notes && { notes: entry.notes.map(noteAt(key)) }),
    } as LessonPosition;
  }
  return { lesson: { ...lesson, positions: marking }, traps };
}

/**
 * Each trap the notes draw, in file order: where it starts (a position note's
 * position, or the position after a note's move), that position's variation,
 * and its note.
 */
function studyTraps(lesson: StudyLesson) {
  const found: { at: PositionKey; variation: VariationId; trap: Trap; note: StudyNote }[] = [];
  const add = (at: PositionKey, variation: VariationId, notes: readonly StudyNote[] = []) => {
    for (const note of notes)
      for (const idea of note.ideas ?? [])
        if (idea.type === 'trap') found.push({ at, variation, trap: idea, note });
  };
  for (const [key, entry] of Object.entries(lesson.positions)) {
    add(key, entry.variation, entry.notes);
    for (const move of entry.moves) {
      if (!move.notes) continue;
      const after = parsePositionKey(key)!;
      playMove(after, move.uci);
      add(positionKey(after), entry.variation, move.notes);
    }
  }
  return found;
}

/**
 * Writes `moves`, a trap from `at`, into the guide tree: its first move
 * always, and each later one unless the guide goes its own way there, where
 * it stops. The learner's punishing moves are book moves, as Act III writes
 * them (docs/plans/opportunities.md): there the guide goes its own way only
 * with another book move. Elsewhere any other move does. New positions take
 * `variation`. Example: in Black's lesson, the trap 6.Qxd5? Qxc1#, where the
 * guide has 6...Qxc1# only as a side line's move, books 6...Qxc1#.
 */
function placeTrap(
  positions: Record<PositionKey, Entry>,
  side: Color,
  at: PositionKey,
  variation: VariationId,
  moves: readonly Uci[],
) {
  const pos = parsePositionKey(at)!;
  const erring = pos.turn;
  let key = at;
  for (const [n, uci] of moves.entries()) {
    const entry = (positions[key] ??= { variation, moves: [] });
    const book = pos.turn === side && pos.turn !== erring;
    const i = entry.moves.findIndex((move) => move.uci === uci);
    const ownWay = book
      ? entry.moves.some((move) => move.book && move.uci !== uci)
      : n > 0 && i === -1 && entry.moves.length > 0;
    if (ownWay) return;
    if (i === -1) entry.moves.push(book ? { uci, book } : { uci });
    else if (book) entry.moves[i] = { ...entry.moves[i], book };
    playMove(pos, uci);
    key = positionKey(pos);
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

/**
 * `lesson`, once nothing else changes its tree, with each mark's length left
 * only where the guide goes on past it, and each mark whose verdict its line
 * now contradicts by the checker's rule (`trapProblem`) taken off with the
 * notes that name it; and how each of `traps` came out: the ones whose line
 * differs from the study's, and those that lost their mark here or earlier.
 */
export function settleMistakes(
  lesson: Lesson,
  traps: readonly StudyTrap[],
): { lesson: Lesson; changed: ChangedTrap[]; unmarked: UnmarkedTrap[] } {
  const fitted = {
    ...lesson,
    positions: mapMoves(lesson, (move, key) => fitPlies(lesson, key, move)),
  };
  const refused = new Map<string, string>();
  for (const [key, { moves }] of Object.entries(fitted.positions)) {
    for (const move of moves) {
      const verdict = move.mistake?.verdict;
      const pos = parsePositionKey(key)!;
      const problem = verdict && trapProblem(pos, mistakeLine(fitted, key, move), verdict);
      if (problem) refused.set(markId(key, move.uci), problem);
    }
  }
  const settled = withoutMarks(fitted, refused);
  const lines = linesTo(settled);
  const changed: ChangedTrap[] = [];
  const unmarked: UnmarkedTrap[] = [];
  for (const { at, moves, text } of traps) {
    const route = lines.get(at);
    const pos = parsePositionKey(at)!;
    const firstPly = route ? route.line.length + 1 : 1;
    const line = route ? numberedLine(lineSans(route.line)) : at;
    const study = numberedLine(lineSans(moves, pos), firstPly);
    const move = settled.positions[at]?.moves.find(({ uci }) => uci === moves[0]);
    if (!move?.mistake) {
      const reason = refused.get(markId(at, moves[0]));
      unmarked.push({ line, study, ...(reason && { reason }) });
      continue;
    }
    const shownMoves = mistakeLine(settled, at, move);
    if (String(shownMoves) === String(moves)) continue;
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

/** `move` at `key` with its mark's length left out where the guide stops there anyway. */
function fitPlies(lesson: Lesson, key: PositionKey, move: LessonMove): LessonMove {
  if (move.mistake?.plies === undefined) return move;
  const { plies, ...mark } = move.mistake;
  const whole = mistakeLine(lesson, key, { uci: move.uci }).length;
  return { ...move, mistake: plies < whole ? { ...mark, plies } : mark };
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

/** `lesson` without the marks in `gone` (by `markId`), nor the notes that name one. */
function withoutMarks(lesson: Lesson, gone: ReadonlyMap<string, string>): Lesson {
  if (gone.size === 0) return lesson;
  const kept = (at: PositionKey) => (note: Note) =>
    !note.ideas?.some((idea) => idea.type === 'mistake' && gone.has(markId(at, idea.move)));
  const notesOf = <T extends { readonly notes?: readonly Note[] }>(item: T, at: PositionKey): T => {
    const notes = item.notes?.filter(kept(at));
    const { notes: _notes, ...rest } = item;
    return (notes?.length ? { ...rest, notes } : rest) as T;
  };
  const positions = mapMoves(lesson, (move, key) => {
    const after = parsePositionKey(key)!;
    playMove(after, move.uci);
    const { mistake, ...rest } = notesOf(move, positionKey(after));
    return mistake && !gone.has(markId(key, move.uci)) ? { ...rest, mistake } : rest;
  });
  for (const [key, entry] of Object.entries(positions)) positions[key] = notesOf(entry, key);
  return { ...lesson, positions };
}
