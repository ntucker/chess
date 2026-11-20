/**
 * The openings the app teaches, met at the start position: its candidates
 * are each lesson's first moves (White's, for a Black lesson), and playing
 * one picks that lesson. Every lesson's start lists them all, so stepping
 * back to the start picks another. Pure functions over the lesson index
 * (assets/lessons/index.json), like the rest of src/lesson/.
 */
import { Chess } from 'chessops/chess';
import { INITIAL_FEN } from 'chessops/fen';

import { positionKey } from '@/game/replay';

import { LESSON_FORMAT, onDomain, type Lesson, type LessonSource, type Uci } from './lesson';

const START_KEY = positionKey(Chess.default());

/**
 * What the start position needs to know of a lesson before it loads. Its
 * sources are credited where the start position previews the lesson's move.
 */
export interface IndexEntry extends Pick<Lesson, 'title' | 'side' | 'sources'> {
  /** The guide's moves at the lesson's start: the moves that pick it. */
  readonly firstMoves: readonly Uci[];
}

/**
 * Every lesson's `IndexEntry`, by lesson id. No two lessons share a first
 * move, and all teach one side (src/resources/lesson.test.ts holds both).
 */
export type LessonIndex<Id extends string = string> = Readonly<Record<Id, IndexEntry>>;

/** What the lesson index says of `lesson`. */
export function indexEntry({ title, side, sources, positions }: Lesson): IndexEntry {
  const firstMoves = positions[START_KEY]?.moves.map(({ uci }) => uci) ?? [];
  return { title, side, sources, firstMoves };
}

/** The lesson `line` plays: the one its first move picks; none before a move. */
export function lessonOf<Id extends string>(
  index: LessonIndex<Id>,
  line: readonly Uci[],
): Id | undefined {
  const [first] = line;
  return (Object.keys(index) as Id[]).find((id) => index[id].firstMoves.includes(first));
}

/** Every lesson's first moves, in the index's order, each crediting its sources. */
const openingMoves = (index: LessonIndex) =>
  Object.values(index).flatMap(({ title, sources, firstMoves: ucis }) => {
    const notes = [{ text: `${title}, from ${listed(sources.map(credit))}.` }];
    return ucis.map((uci) => ({ uci, notes }));
  });

/**
 * How a note names `source`: a lichess study by its author, anything else by
 * its title and author, and then its license if it has one. A note is plain
 * text, so the license's link stays in the lesson file.
 */
function credit({ title, author, url, license }: LessonSource): string {
  const parsed = new URL(url);
  const study = onDomain(parsed, 'lichess.org') && parsed.pathname.startsWith('/study/');
  const name = study ? `${author}'s lichess study` : `${title} by ${author}`;
  return license ? `${name} (${license.name})` : name;
}

/** Every source the index's lessons credit, each once (the same URL is the same source). */
const sourcesOf = (index: LessonIndex): LessonSource[] => [
  ...new Map(
    Object.values(index).flatMap(({ sources }) =>
      sources.map((source) => [source.url, source] as const),
    ),
  ).values(),
];

/** `items` as an English list: "a", "a and b", "a, b and c". */
const listed = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** The variation of the start position while no lesson is picked. */
const OPENINGS_VARIATION = 'openings';

/**
 * The lesson shown before an opening is picked: only the start position,
 * with every opening's first move, for the side every lesson teaches.
 */
export function openingsLesson(index: LessonIndex): Lesson {
  const side = Object.values(index)[0]?.side ?? 'white';
  return {
    format: LESSON_FORMAT,
    id: OPENINGS_VARIATION,
    title: 'Openings',
    side,
    start: INITIAL_FEN,
    // Its notes come from the lessons', so it credits their sources.
    sources: sourcesOf(index),
    variations: { [OPENINGS_VARIATION]: { name: 'Openings' } },
    positions: {
      [START_KEY]: { variation: OPENINGS_VARIATION, moves: openingMoves(index) },
    },
  };
}

/**
 * `lesson` with every opening's first moves at the start, so the learner can
 * step back and pick another; its own keep what the file says of them. A
 * lesson that never reaches the start is returned as it is.
 */
export function withOpenings(lesson: Lesson, index: LessonIndex): Lesson {
  const start = lesson.positions[START_KEY];
  if (!start) return lesson;
  const own = new Map(start.moves.map((move) => [move.uci, move]));
  const moves = openingMoves(index).map((move) => {
    const file = own.get(move.uci);
    return file ? { ...file, notes: [...move.notes, ...(file.notes ?? [])] } : move;
  });
  return { ...lesson, positions: { ...lesson.positions, [START_KEY]: { ...start, moves } } };
}
