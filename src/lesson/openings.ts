/**
 * The openings the app teaches, met at the start position: its candidates
 * are each lesson's first moves (White's, for a Black lesson), and playing
 * one picks that lesson. Every lesson's start lists them all, so stepping
 * back to the start picks another. Pure functions over the lesson index
 * (assets/lessons/index.json), like the rest of src/lesson/.
 */
import { Chess } from 'chessops/chess';
import { INITIAL_FEN } from 'chessops/fen';
import { parseUci } from 'chessops/util';

import { positionKey } from '@/game/replay';
import { positionHash } from '@/progress/progress';

import { cleanLineEnds, inCleanRun } from './cleanRun';
import { LESSON_FORMAT, onDomain, type Lesson, type LessonSource, type Uci } from './lesson';

const START_KEY = positionKey(Chess.default());

/**
 * What the start position needs to know of a lesson before it loads. Its
 * sources are credited where the start position previews the lesson's move.
 */
export interface IndexEntry extends Pick<Lesson, 'title' | 'side' | 'sources'> {
  /** The guide's moves at the lesson's start: the moves that pick it. */
  readonly firstMoves: readonly Uci[];
  /**
   * By first move, the `positionHash` of every line end a clean Practice run
   * can reach through it (`cleanLineEnds`), so the start position's row can
   * be passed without loading the lesson. None for a learner's first move a
   * clean run would not play.
   */
  readonly lineEnds: Readonly<Record<Uci, readonly string[]>>;
}

/**
 * Every lesson's `IndexEntry`, by lesson id. No two lessons share a first
 * move, and all teach one side (src/resources/lesson.test.ts holds both).
 */
export type LessonIndex<Id extends string = string> = Readonly<Record<Id, IndexEntry>>;

/** What the lesson index says of `lesson`. */
export function indexEntry(lesson: Lesson): IndexEntry {
  const { title, side, sources, positions } = lesson;
  const moves = positions[START_KEY]?.moves ?? [];
  // White moves first, so only a White lesson's first moves are the learner's.
  const learner = side === 'white';
  const lineEnds = Object.fromEntries(
    moves.map((move) => [
      move.uci,
      inCleanRun(move, learner)
        ? cleanLineEnds(lesson, startAfter(move.uci)).map(positionHash).sort()
        : [],
    ]),
  );
  return { title, side, sources, firstMoves: moves.map(({ uci }) => uci), lineEnds };
}

/** The start position's key after `uci`. */
function startAfter(uci: Uci) {
  const pos = Chess.default();
  pos.play(parseUci(uci)!);
  return positionKey(pos);
}

/** The lesson `line` plays: the one its first move picks; none before a move. */
export function lessonOf<Id extends string>(
  index: LessonIndex<Id>,
  line: readonly Uci[],
): Id | undefined {
  const [first] = line;
  return (Object.keys(index) as Id[]).find((id) => index[id].firstMoves.includes(first));
}

/** The lessons a piece on `square` picks: those with a first move from there. */
export function lessonsFrom<Id extends string>(index: LessonIndex<Id>, square: string): Id[] {
  return (Object.keys(index) as Id[]).filter((id) =>
    index[id].firstMoves.some((uci) => uci.slice(0, 2) === square),
  );
}

/** Every lesson's first moves, in the index's order, each crediting its sources. */
const openingMoves = (index: LessonIndex) =>
  Object.values(index).flatMap(({ title, sources, firstMoves: ucis }) => {
    const notes = [{ text: `${title}, from ${listed(sources.map(credit))}.` }];
    return ucis.map((uci) => ({ uci, notes }));
  });

/**
 * How the app names `source`: a lichess study by its author, anything else by
 * its title and author. Its URL parses: the checker has read every shipped
 * lesson's sources.
 */
export function sourceName({ title, author, url }: LessonSource): string {
  const parsed = new URL(url);
  const study = onDomain(parsed, 'lichess.org') && parsed.pathname.startsWith('/study/');
  return study ? `${author}'s lichess study` : `${title} by ${author}`;
}

/** How a note credits `source`: its name, then its license's. A note is plain text; the lesson screen's credits link both. */
const credit = (source: LessonSource) =>
  source.license ? `${sourceName(source)} (${source.license.name})` : sourceName(source);

/** Every source the index's lessons credit, each once (the same URL is the same source). */
const sourcesOf = (index: LessonIndex): LessonSource[] => [
  ...new Map(
    Object.values(index).flatMap(({ sources }) =>
      sources.map((source) => [source.url, source] as const),
    ),
  ).values(),
];

/** What comes before item `i` of `count` in an English list: "a", "a and b", "a, b and c". */
export const listSeparator = (i: number, count: number) =>
  i === 0 ? '' : i === count - 1 ? ' and ' : ', ';

const listed = (items: readonly string[]) =>
  items.map((item, i) => listSeparator(i, items.length) + item).join('');

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
