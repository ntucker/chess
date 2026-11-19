/**
 * The openings the app teaches, met at the start position: its candidates
 * are each lesson's first moves (White's, for a Black lesson), and playing
 * one picks that lesson. Every lesson's start lists them all, so stepping
 * back to the start picks another. Pure functions over the lesson index
 * (assets/lessons/index.json), like the rest of src/lesson/.
 */
import { Chess } from 'chessops/chess';
import { INITIAL_FEN } from 'chessops/fen';
import type { Color } from 'chessops/types';

import { positionKey } from '@/game/replay';

import { LESSON_FORMAT, type Lesson, type LessonSource, type Uci } from './lesson';

const START_KEY = positionKey(Chess.default());

/** What the start position needs to know of a lesson before it loads. */
export interface IndexEntry {
  /** As `Lesson.title`. */
  readonly title: string;
  /** As `Lesson.side`. */
  readonly side: Color;
  /** As `Lesson.source`: credited where the start position previews the lesson's move. */
  readonly source: LessonSource;
  /** The guide's moves at the lesson's start: the moves that pick it. */
  readonly firstMoves: readonly Uci[];
}

/** Every lesson's `IndexEntry`, by lesson id. No two lessons share a first move. */
export type LessonIndex = Readonly<Record<string, IndexEntry>>;

/** What the lesson index says of `lesson`. */
export function indexEntry({ title, side, source, positions }: Lesson): IndexEntry {
  const firstMoves = positions[START_KEY]?.moves.map(({ uci }) => uci) ?? [];
  return { title, side, source, firstMoves };
}

/** The lesson `line` plays: the one its first move picks; none before a move. */
export function lessonOf<Id extends string>(
  index: Readonly<Record<Id, IndexEntry>>,
  line: readonly Uci[],
): Id | undefined {
  const [first] = line;
  return (Object.keys(index) as Id[]).find((id) => index[id].firstMoves.includes(first));
}

/** The variation of the start position while no lesson is picked. */
const OPENINGS_VARIATION = 'openings';

/**
 * The lesson shown before an opening is picked: only the start position,
 * with every opening's first move. The start lists one side's openings, the
 * first lesson's (src/resources/lesson.test.ts holds every lesson to one).
 */
export function openingsLesson(index: LessonIndex): Lesson {
  const side = Object.values(index)[0]?.side ?? 'white';
  return {
    format: LESSON_FORMAT,
    id: OPENINGS_VARIATION,
    title: 'Openings',
    side,
    start: INITIAL_FEN,
    source: { title: 'Opening Night', author: 'Opening Night', url: '' },
    variations: { [OPENINGS_VARIATION]: { name: 'Openings' } },
    positions: {
      [START_KEY]: { variation: OPENINGS_VARIATION, moves: firstMoves(index, side) },
    },
  };
}

/**
 * `lesson` with every opening of its side's first moves at the start, so the
 * learner can step back and pick another; its own keep what the file says of
 * them. A lesson that never reaches the start is returned as it is.
 */
export function withOpenings(lesson: Lesson, index: LessonIndex): Lesson {
  const start = lesson.positions[START_KEY];
  if (!start) return lesson;
  const own = new Map(start.moves.map((move) => [move.uci, move]));
  const moves = firstMoves(index, lesson.side).map((move) => {
    const file = own.get(move.uci);
    return file ? { ...file, notes: [...move.notes, ...(file.notes ?? [])] } : move;
  });
  return { ...lesson, positions: { ...lesson.positions, [START_KEY]: { ...start, moves } } };
}

/** The first moves of the lessons for `side`, in the index's order, each crediting its lesson's source. */
const firstMoves = (index: LessonIndex, side: Color) =>
  Object.values(index)
    .filter((entry) => entry.side === side)
    .flatMap(({ title, source, firstMoves: ucis }) =>
      ucis.map((uci) => ({
        uci,
        notes: [{ text: `${title}, from ${source.author}'s lichess study.` }],
      })),
    );
