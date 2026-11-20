/**
 * The openings the app teaches, met at the start position for the side the
 * learner plays. Each lesson is picked by the moves that lead into it from
 * the start (`OpeningLine`): one move where no other lesson of its side
 * plays it (1.e4, the Caro-Kann), more where lessons share their first moves
 * (1.d4 d5 2.c4, the Slav, beside 1.d4 d5 2.Bf4, the anti-London). Until a
 * line picks one, the board shows those shared moves alone and the learner
 * plays both sides; every lesson lists them, so stepping back to them picks
 * another. Pure functions over the lesson index
 * (assets/lessons/index.json), like the rest of src/lesson/.
 */
import { Chess } from 'chessops/chess';
import { INITIAL_FEN } from 'chessops/fen';
import type { Color } from 'chessops/types';
import { parseUci } from 'chessops/util';

import { positionKey } from '@/game/replay';
import { positionHash } from '@/progress/progress';

import { cleanLineEnds, inCleanRun } from './cleanRun';
import {
  LESSON_FORMAT,
  onDomain,
  type Lesson,
  type LessonMove,
  type LessonSource,
  type PositionKey,
  type Uci,
} from './lesson';

/**
 * Moves from the start that pick a lesson: they follow its guide, and the
 * last is the first that no other lesson of its side plays there.
 */
export interface OpeningLine {
  readonly moves: readonly Uci[];
  /**
   * The `positionHash` of every line end a clean Practice run can reach
   * through it (`cleanLineEnds`), so the start's rows can be passed without
   * loading the lesson. None when a clean run would not play one of its
   * learner's moves.
   */
  readonly lineEnds: readonly string[];
}

/**
 * What the start position needs to know of a lesson before it loads. Its
 * sources are credited where the start position previews the lesson's move.
 */
export interface IndexEntry extends Pick<Lesson, 'title' | 'side' | 'sources'> {
  /** The lines that pick it, in the guide's order. */
  readonly lines: readonly OpeningLine[];
}

/**
 * Every lesson's `IndexEntry`, by lesson id. Each lesson has a line, and no
 * line of one is the start of another's (src/resources/lesson.test.ts holds both).
 */
export type LessonIndex<Id extends string = string> = Readonly<Record<Id, IndexEntry>>;

/** The index of `lessons`, in their order: each one's lines leave the others of its side. */
export function lessonIndex(lessons: readonly Lesson[]): LessonIndex {
  const lines = new Map<Lesson, Uci[][]>(lessons.map((lesson) => [lesson, []]));
  for (const side of ['white', 'black'] as const) {
    const ofSide = lessons.filter((lesson) => lesson.side === side);
    if (ofSide.length) walkShared(ofSide, [], Chess.default(), new Set(), lines);
  }
  return Object.fromEntries(
    lessons.map((lesson) => {
      const { id, title, side, sources } = lesson;
      const picks = lines.get(lesson)!.map((moves) => ({
        moves,
        lineEnds: lineEnds(lesson, moves),
      }));
      return [id, { title, side, sources, lines: picks }];
    }),
  );
}

/**
 * Follows the guide moves `sharing` all play from `pos`, reached by `line`:
 * a move only one of them plays ends a line of its; one several play goes on.
 * A position the line passed twice ends nothing.
 */
function walkShared(
  sharing: readonly Lesson[],
  line: readonly Uci[],
  pos: Chess,
  passed: ReadonlySet<PositionKey>,
  lines: Map<Lesson, Uci[][]>,
) {
  const key = positionKey(pos);
  if (passed.has(key)) return;
  const movesOf = (lesson: Lesson) => lesson.positions[key]?.moves ?? [];
  const ucis = new Set(sharing.flatMap((lesson) => movesOf(lesson).map(({ uci }) => uci)));
  for (const uci of ucis) {
    const playing = sharing.filter((lesson) => movesOf(lesson).some((move) => move.uci === uci));
    if (playing.length === 1) lines.get(playing[0])!.push([...line, uci]);
    else walkShared(playing, [...line, uci], played(pos, uci), new Set(passed).add(key), lines);
  }
}

/** `OpeningLine.lineEnds` for `moves` in `lesson`. */
function lineEnds(lesson: Lesson, moves: readonly Uci[]): string[] {
  let pos = Chess.default();
  for (const uci of moves) {
    const move = lesson.positions[positionKey(pos)].moves.find((m) => m.uci === uci)!;
    if (!inCleanRun(move, pos.turn === lesson.side)) return [];
    pos = played(pos, uci);
  }
  return cleanLineEnds(lesson, positionKey(pos)).map(positionHash).sort();
}

/** A copy of `pos` after the legal move `uci`. */
function played(pos: Chess, uci: Uci) {
  const after = pos.clone();
  after.play(parseUci(uci)!);
  return after;
}

/** Whether `line` begins with every move of `start`. */
const startsWith = (line: readonly Uci[], start: readonly Uci[]) =>
  start.length <= line.length && start.every((uci, i) => line[i] === uci);

/** Whether the opening line `moves` and `line` agree as far as both go: `line` leads to it, or it picked `line`'s lesson. */
export const meets = (moves: readonly Uci[], line: readonly Uci[]) =>
  startsWith(moves, line) || startsWith(line, moves);

/** Each line of `side`'s lessons, with the lesson it picks. */
const linesOf = <Id extends string>(index: LessonIndex<Id>, side: Color) =>
  (Object.keys(index) as Id[]).flatMap((id) =>
    index[id].side === side ? index[id].lines.map((line) => ({ id, line })) : [],
  );

/** The lesson of `side` that `line` plays: the one a line it begins with picks; none before one does. */
export function lessonOf<Id extends string>(
  index: LessonIndex<Id>,
  side: Color,
  line: readonly Uci[],
): Id | undefined {
  return linesOf(index, side).find(({ line: { moves } }) => startsWith(line, moves))?.id;
}

/**
 * Whether `line` is among the moves `side`'s lessons share before a line
 * picks one, where the board lists the openings: the start, at least.
 */
export const isPicking = (index: LessonIndex, side: Color, line: readonly Uci[]) =>
  linesOf(index, side).some(
    ({ line: { moves } }) => moves.length > line.length && startsWith(moves, line),
  );

/** The lessons of `side` that `line` still leads to, or the one it picked, in the index's order. */
export function lessonsAfter<Id extends string>(
  index: LessonIndex<Id>,
  side: Color,
  line: readonly Uci[],
): Id[] {
  const ids = linesOf(index, side).flatMap(({ id, line: { moves } }) =>
    meets(moves, line) ? [id] : [],
  );
  return [...new Set(ids)];
}

/** The lessons a piece on `square` leads to from `line`, which the board shows while picking. */
export function lessonsFrom<Id extends string>(
  index: LessonIndex<Id>,
  side: Color,
  line: readonly Uci[],
  square: string,
): Id[] {
  return lessonsAfter(index, side, line).filter((id) =>
    index[id].lines.some(
      ({ moves }) => startsWith(moves, line) && moves[line.length]?.slice(0, 2) === square,
    ),
  );
}

/**
 * The moves `side`'s lessons share and the moves that pick them, at each
 * position before a line picks one, each crediting the lessons it leads to.
 * A learner's move is a book move where a clean run can go on through it.
 */
function openingMoves(index: LessonIndex, side: Color): Map<PositionKey, LessonMove[]> {
  const at = new Map<PositionKey, Map<Uci, { readonly ids: string[]; book: boolean }>>();
  for (const { id, line } of linesOf(index, side)) {
    let pos = Chess.default();
    for (const uci of line.moves) {
      const key = positionKey(pos);
      const moves = at.get(key) ?? new Map();
      at.set(key, moves);
      const found = moves.get(uci) ?? { ids: [], book: false };
      moves.set(uci, found);
      if (!found.ids.includes(id)) found.ids.push(id);
      found.book ||= pos.turn === side && line.lineEnds.length > 0;
      pos = played(pos, uci);
    }
  }
  return new Map(
    [...at].map(([key, moves]) => [
      key,
      [...moves].map(([uci, { ids, book }]) => ({
        uci,
        ...(book && { book }),
        notes: ids.map((id) => {
          const { title, sources } = index[id];
          return { text: `${title}, from ${listed(sources.map(credit))}.` };
        }),
      })),
    ]),
  );
}

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

/** The variation of the positions before a lesson is picked. */
const OPENINGS_VARIATION = 'openings';

/**
 * The lesson shown before an opening is picked: only the moves before a line
 * picks one of `side`'s lessons, the start's first.
 */
export function openingsLesson(index: LessonIndex, side: Color): Lesson {
  const ofSide = Object.fromEntries(
    Object.entries(index).filter(([, entry]) => entry.side === side),
  );
  return {
    format: LESSON_FORMAT,
    id: OPENINGS_VARIATION,
    title: 'Openings',
    side,
    start: INITIAL_FEN,
    // Its notes come from the lessons', so it credits their sources.
    sources: sourcesOf(ofSide),
    variations: { [OPENINGS_VARIATION]: { name: 'Openings' } },
    positions: Object.fromEntries(
      [...openingMoves(index, side)].map(([key, moves]) => [
        key,
        { variation: OPENINGS_VARIATION, moves },
      ]),
    ),
  };
}

/**
 * `lesson` with the openings of its side listed where they are picked, so
 * the learner can step back and pick another; its own moves keep what the
 * file says of them, after the openings' notes.
 */
export function withOpenings(lesson: Lesson, index: LessonIndex): Lesson {
  const positions = { ...lesson.positions };
  for (const [key, openings] of openingMoves(index, lesson.side)) {
    const here = positions[key];
    if (!here) continue;
    const own = new Map(here.moves.map((move) => [move.uci, move]));
    const moves = openings.map((move) => {
      const file = own.get(move.uci);
      return file ? { ...file, notes: [...move.notes!, ...(file.notes ?? [])] } : move;
    });
    const rest = here.moves.filter(({ uci }) => !openings.some((move) => move.uci === uci));
    positions[key] = { ...here, moves: [...moves, ...rest] };
  }
  return { ...lesson, positions };
}
