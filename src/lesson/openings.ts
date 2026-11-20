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
import { type Color, parsePositionKey, playMove, positionKey } from '@/game/replay';
import { positionHash } from '@/progress/progress';

import { cleanLineEnds, gamesPlayed, inCleanRun } from './cleanRun';
import {
  LESSON_FORMAT,
  onDomain,
  type Lesson,
  type LessonMove,
  type LessonSource,
  type Note,
  type PositionKey,
  type Uci,
  type VariationId,
} from './lesson';
import { LikeliestFirst } from './likeliestFirst';
import { lineKeys, type VariationOf } from './select';

/**
 * Moves from the start that pick a lesson: they follow its guide, and the
 * last is the first that no other lesson of its side plays there.
 */
export interface OpeningLine {
  readonly moves: readonly Uci[];
  /** The `positionHash` of the position its last move reaches, where it picks the lesson. */
  readonly picked: string;
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
  /** Its named variations, in the file's order, each with the line that opens it. */
  readonly variations: readonly IndexVariation[];
}

/** A lesson's address (`/lesson/<id>`), without a trailing slash (GitHub Pages 404s on one). */
export const lessonHref = <Id extends string>(id: Id) => `/lesson/${id}` as const;

/** The address that opens lesson `id` at `variation` (`?variation=`), or at its start without one. */
export const variationHref = <Id extends string>(id: Id, variation?: VariationId) =>
  ({ pathname: lessonHref(id), params: variation === undefined ? {} : { variation } }) as const;

/** The line variation `id` of lesson `entry` opens at; none when it names none of its variations. */
export const variationLine = (entry: Pick<IndexEntry, 'variations'>, id?: VariationId) =>
  entry.variations.find((variation) => variation.id === id)?.moves;

/** A lesson's variation as the opening list shows it, before the lesson loads. */
export interface IndexVariation extends VariationOf {
  /**
   * The line into it from the start that games play most often, after a
   * line that picks the lesson (`variationLines`): where the list opens it.
   * The opening itself, where no position is its own, has the first line that picks it.
   */
  readonly moves: readonly Uci[];
}

/**
 * Every lesson's `IndexEntry`, by lesson id. Each lesson has a line
 * (`lessonIndex` throws otherwise), and no line of one is the start of
 * another's (src/resources/lesson.test.ts holds it).
 */
export type LessonIndex<Id extends string = string> = Readonly<Record<Id, IndexEntry>>;

/**
 * The index of `lessons`, in their order: each one's lines leave the others
 * of its side. Throws when another lesson of its side plays all of one's moves.
 */
export function lessonIndex(lessons: readonly Lesson[]): LessonIndex {
  const lines = new Map<Lesson, Uci[][]>(lessons.map((lesson) => [lesson, []]));
  for (const side of ['white', 'black'] as const) {
    const ofSide = lessons.filter((lesson) => lesson.side === side);
    if (ofSide.length) walkShared(ofSide, [], new Set(), lines);
  }
  const unpicked = lessons.filter((lesson) => lines.get(lesson)!.length === 0);
  if (unpicked.length) {
    const ids = unpicked.map(({ id }) => id).join(', ');
    throw new Error(`No moves pick ${ids}: another lesson of its side plays all of them`);
  }
  return Object.fromEntries(
    lessons.map((lesson) => {
      const { id, title, side, sources } = lesson;
      const picking = lines.get(lesson)!;
      const picks = picking.map((line) => ({
        moves: line,
        picked: positionHash(lineKeys(line).at(-1)!),
        lineEnds: cleanEndHashes(lesson, line),
      }));
      return [
        id,
        { title, side, sources, lines: picks, variations: variationLines(lesson, picking) },
      ];
    }),
  );
}

/**
 * Follows the guide moves `sharing` all play after `line`, at the learner's
 * turns only their book moves (a move a guide warns against picks nothing): a
 * move only one of them plays ends a line of its; one several play goes on. A
 * position the line passed twice ends nothing.
 */
function walkShared(
  sharing: readonly Lesson[],
  line: readonly Uci[],
  passed: ReadonlySet<PositionKey>,
  lines: Map<Lesson, Uci[][]>,
) {
  const key = lineKeys(line).at(-1)!;
  if (passed.has(key)) return;
  // `lessonIndex` walks each side's lessons apart, so they all share one side.
  const learnerMoves = parsePositionKey(key)!.turn === sharing[0].side;
  const movesOf = (lesson: Lesson) =>
    (lesson.positions[key]?.moves ?? []).filter((move) => !learnerMoves || move.book);
  const ucis = new Set(sharing.flatMap((lesson) => movesOf(lesson).map(({ uci }) => uci)));
  for (const uci of ucis) {
    const playing = sharing.filter((lesson) => movesOf(lesson).some((move) => move.uci === uci));
    if (playing.length === 1) lines.get(playing[0])!.push([...line, uci]);
    else walkShared(playing, [...line, uci], new Set(passed).add(key), lines);
  }
}

/**
 * Each variation of `lesson` its guide reaches through one of the lines that
 * pick it (`picks`), in the file's order, with the line into it that games
 * play most often (`likeliestInto`). A variation is looked for past its
 * parent's line first, so the list can show it carrying on from its parent,
 * then past `picks`; the learner plays a move that isn't a book move only
 * where no line of book moves from either reaches it. The opening itself is
 * always kept, so the variations form one tree.
 */
function variationLines(lesson: Lesson, picks: readonly Uci[][]): IndexVariation[] {
  const found = new Map<VariationId, Uci[] | undefined>();
  const lineOf = (id: VariationId): Uci[] | undefined => {
    if (found.has(id)) return found.get(id);
    found.set(id, undefined); // A parent loop finds nothing.
    const { parent } = lesson.variations[id];
    const after = parent === undefined ? undefined : lineOf(parent);
    const reach = (starts: readonly (readonly Uci[])[], bookOnly: boolean) =>
      likeliestInto(lesson, id, starts, bookOnly);
    // In order: book moves past the parent's line, then past `picks`; any move,
    // the same; the opening itself at the first line that picks it.
    const line =
      (after && reach([after], true)) ??
      reach(picks, true) ??
      (after && reach([after], false)) ??
      reach(picks, false) ??
      (parent === undefined ? [...picks[0]] : undefined);
    found.set(id, line);
    return line;
  };
  // A variation left out passes its children to its nearest ancestor kept.
  const keptAncestor = (id?: VariationId): VariationId | undefined =>
    id === undefined || lineOf(id) ? id : keptAncestor(lesson.variations[id].parent);
  return Object.entries(lesson.variations).flatMap(([id, variation]) => {
    const moves = lineOf(id);
    if (!moves) return [];
    const parent = keptAncestor(variation.parent);
    return [{ id, name: variation.name, ...(parent && { parent }), moves }];
  });
}

/**
 * The line of the guide's moves from one of `starts` into a position of
 * `variation` that games play most often: the product of each move's share
 * of its position's games (`moveShares`). Best first, so the first position
 * of `variation` reached is the likeliest; every move past it only lowers
 * the share. With `bookOnly` the learner plays only book moves.
 */
function likeliestInto(
  lesson: Lesson,
  variation: VariationId,
  starts: readonly (readonly Uci[])[],
  bookOnly: boolean,
): Uci[] | undefined {
  const reached = new Set<PositionKey>();
  const queue = new LikeliestFirst();
  for (const line of starts) {
    const pos = Chess.default();
    if (line.every((uci) => playMove(pos, uci))) queue.push({ line: [...line], pos, share: 1 });
  }
  for (let next = queue.pop(); next; next = queue.pop()) {
    const { line, pos, share } = next;
    const key = positionKey(pos);
    const here = lesson.positions[key];
    if (!here || reached.has(key)) continue;
    if (here.variation === variation) return line;
    reached.add(key);
    // The learner plays the book, however rarely games do: only its book
    // moves share the games, where it has any.
    const learner = pos.turn === lesson.side;
    const moves =
      learner && here.moves.some(({ book }) => book) && bookOnly
        ? here.moves.filter(({ book }) => book)
        : here.moves;
    const shares = moveShares(moves);
    moves.forEach(({ uci }, i) => {
      const played = pos.clone();
      if (playMove(played, uci))
        queue.push({ line: [...line, uci], pos: played, share: share * shares[i] });
    });
  }
  return undefined;
}

/**
 * Each move's share of the games played from its position, over every rating
 * band: a move without counts beside moves with them has almost none. Where
 * no move has counts, none is likelier, so the shorter line wins, and of two
 * as short, the one through the guide's earlier moves.
 */
function moveShares(moves: readonly LessonMove[]): number[] {
  const games = moves.map((move) => gamesPlayed(move) ?? 0);
  const total = games.reduce((sum, count) => sum + count, 0);
  return total > 0
    ? games.map((count) => Math.max(count, UNCOUNTED_GAMES) / total)
    : moves.map(() => 1);
}

/**
 * The games a move without counts beside moves with them is reckoned at: less
 * than one, so it comes after every move played in a game at its position,
 * but reachable.
 */
const UNCOUNTED_GAMES = 1e-3;

/** `OpeningLine.lineEnds` for `moves` in `lesson`. */
function cleanEndHashes(lesson: Lesson, moves: readonly Uci[]): string[] {
  const keys = lineKeys(moves);
  const clean = moves.every((uci, n) =>
    inCleanRun(
      lesson.positions[keys[n]].moves.find((move) => move.uci === uci)!,
      parsePositionKey(keys[n])!.turn === lesson.side,
    ),
  );
  return clean ? cleanLineEnds(lesson, keys.at(-1)!).map(positionHash).sort() : [];
}

/** Whether `line` begins with every move of `start`. */
export const startsWith = (line: readonly Uci[], start: readonly Uci[]) =>
  start.length <= line.length && start.every((uci, i) => line[i] === uci);

/** Whether `a` and `b` are the same line. */
export const sameLine = (a: readonly Uci[], b: readonly Uci[]) =>
  a.length === b.length && startsWith(a, b);

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

/**
 * How many of `line`'s first moves pick the opening: those played where
 * `isPicking` holds that go on along a lesson's line, which a Practice run
 * judges as no move of the learner's. A move that leaves every lesson isn't one.
 */
export function pickingMoves(index: LessonIndex, side: Color, line: readonly Uci[]): number {
  let picks = 0;
  while (
    picks < line.length &&
    isPicking(index, side, line.slice(0, picks)) &&
    linesThrough(index, side, line.slice(0, picks + 1)).length > 0
  )
    picks++;
  return picks;
}

/**
 * The lines of `side`'s lessons that `line` still leads to, or the one that
 * picked its lesson, each with that lesson, in the index's order.
 */
export const linesThrough = <Id extends string>(
  index: LessonIndex<Id>,
  side: Color,
  line: readonly Uci[],
) => linesOf(index, side).filter(({ line: { moves } }) => meets(moves, line));

/** The lessons of `side` that `line` still leads to, or the one it picked, in the index's order. */
export function lessonsAfter<Id extends string>(
  index: LessonIndex<Id>,
  side: Color,
  line: readonly Uci[],
): Id[] {
  return [...new Set(linesThrough(index, side, line).map(({ id }) => id))];
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

/** A move listed before a lesson is picked, crediting the lessons it leads to. */
type OpeningMove = LessonMove & { readonly notes: readonly Note[] };

/**
 * The moves `side`'s lessons share and the moves that pick them, at each
 * position before a line picks one, each crediting the lessons it leads to.
 * A learner's move is a book move where a clean run can go on through it.
 */
function openingMoves(index: LessonIndex, side: Color): Map<PositionKey, OpeningMove[]> {
  const at = new Map<PositionKey, Map<Uci, { readonly ids: string[]; book: boolean }>>();
  for (const { id, line } of linesOf(index, side)) {
    const keys = lineKeys(line.moves);
    for (const [n, uci] of line.moves.entries()) {
      const key = keys[n];
      const moves = at.get(key) ?? new Map();
      at.set(key, moves);
      const found = moves.get(uci) ?? { ids: [], book: false };
      moves.set(uci, found);
      if (!found.ids.includes(id)) found.ids.push(id);
      found.book ||= parsePositionKey(key)!.turn === side && line.lineEnds.length > 0;
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
 * file says of them, after the openings' notes, but not their counts (nor do
 * its other moves there), so the openings list in the index's order whichever
 * lesson is loaded.
 */
export function withOpenings(lesson: Lesson, index: LessonIndex): Lesson {
  const positions = { ...lesson.positions };
  for (const [key, openings] of openingMoves(index, lesson.side)) {
    const here = positions[key];
    if (!here) continue;
    const own = new Map(here.moves.map((move) => [move.uci, move]));
    const moves = openings.map((move) => {
      const file = own.get(move.uci);
      return file
        ? { ...file, games: undefined, notes: [...move.notes, ...(file.notes ?? [])] }
        : move;
    });
    const rest = here.moves
      .filter(({ uci }) => !openings.some((move) => move.uci === uci))
      .map((move) => ({ ...move, games: undefined }));
    positions[key] = { ...here, moves: [...moves, ...rest] };
  }
  return { ...lesson, positions };
}
