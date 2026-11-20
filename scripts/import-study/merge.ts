/**
 * The study's chapters merged into one lesson tree keyed by position, so a
 * position reached in several chapters, or by several move orders, is one
 * entry.
 */
import type { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';
import { makeFen } from 'chessops/fen';

import { positionKey } from '@/game/replay';
import {
  LESSON_FORMAT,
  type Lesson,
  type LessonPosition,
  type Note,
  type PositionKey,
  type Risk,
  type Uci,
  type Variation,
  type VariationId,
} from '@/lesson/lesson';

import type { ChapterNotes } from './extract';
import { chapterMoves, isDubious, mainLine, played, type Chapter, type StudyMove } from './study';

/** What the lesson says about itself, beside its positions. */
export type LessonInfo = Pick<Lesson, 'id' | 'title' | 'side' | 'sources'>;

interface DraftMove {
  readonly uci: Uci;
  book: boolean;
  risk?: Risk;
  readonly notes: Note[];
  /** The source of its notes (see `Chapter.source`). */
  noteSource?: number;
}

interface DraftPosition {
  readonly moves: Map<Uci, DraftMove>;
  readonly notes: Note[];
  noteSource?: number;
  /** The source of the first chapter to recommend a move here (see `Chapter.source`). */
  bookSource?: number;
}

/** The lesson for `chapters`, with `extracted[i]` read from `chapters[i]`. */
export function mergeChapters(
  info: LessonInfo,
  chapters: readonly Chapter[],
  extracted: readonly ChapterNotes[],
  chapterName: ChapterName = numberedChapterName,
): Lesson {
  if (chapters.length === 0) throw new Error(`No chapters to merge for lesson ${info.id}`);
  const start = chapters[0].start;
  if (chapters.some((chapter) => positionKey(chapter.start) !== positionKey(start))) {
    throw new Error('Every chapter of a lesson must start from the same position');
  }
  const tree = new DraftTree(start);
  chapters.forEach((chapter, i) => addChapter(tree, chapter, extracted[i], info.side));
  const { variations, chapterVariation } = chapterVariations(info, chapters, chapterName);
  const variationOf = positionVariations(info.id, variations, chapters, chapterVariation);
  for (const { branches } of extracted) addBranches(tree, branches, variationOf, info.id);
  tree.dropEmpty();

  return {
    format: LESSON_FORMAT,
    id: info.id,
    title: info.title,
    side: info.side,
    start: makeFen(start.toSetup()),
    sources: info.sources,
    variations,
    positions: Object.fromEntries(
      [...tree.positions].map(([key, draft]) => [
        key,
        finish(draft, variationOf.get(key) ?? info.id),
      ]),
    ),
  };
}

/** The merged positions while they are built, each created on first use. */
class DraftTree {
  readonly positions = new Map<PositionKey, DraftPosition>();
  readonly startKey: PositionKey;

  constructor(start: Chess) {
    this.startKey = positionKey(start);
    this.entry(this.startKey);
  }

  /** The position `key`, added if new. */
  entry(key: PositionKey): DraftPosition {
    let draft = this.positions.get(key);
    if (!draft) this.positions.set(key, (draft = { moves: new Map(), notes: [] }));
    return draft;
  }

  /** The move `uci` from `pos`, added (with its position) if new. */
  move(pos: Chess, uci: Uci): DraftMove {
    const moves = this.entry(positionKey(pos)).moves;
    let move = moves.get(uci);
    if (!move) moves.set(uci, (move = { uci, book: false, notes: [] }));
    return move;
  }

  /** Drops positions the guide stops at: they need no entry unless they have notes. */
  dropEmpty() {
    for (const [key, draft] of this.positions) {
      if (draft.moves.size === 0 && draft.notes.length === 0 && key !== this.startKey)
        this.positions.delete(key);
    }
  }
}

/** Adds `chapter`'s moves, book marks, notes and choice-guide risks to `tree`. */
function addChapter(
  tree: DraftTree,
  chapter: Chapter,
  { moveNotes, positionNotes, choices }: ChapterNotes,
  side: Color,
) {
  const source = chapter.source ?? 0;
  // A later source recommends moves only where no earlier one does, or the same move.
  const open = (move: StudyMove) => {
    const draft = tree.positions.get(positionKey(move.before));
    const bookSource = draft?.bookSource;
    return bookSource === undefined || bookSource === source || !!draft?.moves.get(move.uci)?.book;
  };
  const book = bookMoves(chapter, side, new Set(choices.map((choice) => choice.move)), open);
  const recommend = (move: StudyMove) => {
    tree.move(move.before, move.uci).book = true;
    tree.entry(positionKey(move.before)).bookSource ??= source;
  };
  for (const move of chapterMoves(chapter)) {
    tree.move(move.before, move.uci);
    if (book.has(move)) recommend(move);
  }
  for (const { move, note } of moveNotes) addNote(tree.move(move.before, move.uci), note, source);
  for (const { pos, note } of positionNotes) addNote(tree.entry(positionKey(pos)), note, source);
  for (const choice of choices) {
    if (!open(choice.move)) continue;
    recommend(choice.move);
    tree.move(choice.move.before, choice.move.uci).risk ??= choice.risk;
  }
}

/** Adds sequences from comment text, each position in the variation of the position the sequence leaves from. */
function addBranches(
  tree: DraftTree,
  branches: ChapterNotes['branches'],
  variationOf: Map<PositionKey, VariationId>,
  root: VariationId,
) {
  for (const { spot, ucis } of branches) {
    let pos = spot.pos;
    // A sequence may leave from where the study stops: then the variation of the move into it.
    const variation =
      variationOf.get(positionKey(pos)) ??
      (spot.move && variationOf.get(positionKey(spot.move.before))) ??
      root;
    for (const uci of ucis) {
      const key = positionKey(pos);
      if (!variationOf.has(key)) variationOf.set(key, variation);
      tree.move(pos, uci);
      pos = played(pos, uci);
    }
  }
}

/**
 * The variation of each position the chapters reach. On a main line it is the
 * narrowest variation holding every chapter whose main line reaches the
 * position, so shared early moves belong to the opening, not to the first
 * chapter that shows them, and a side line that transposes into another
 * chapter's main line keeps that chapter's name. Off every main line it is
 * the variation of the last main-line position on the way there, or the
 * chapter's group if that is wider: a Van der Wiel chapter's 4.h4 h5 5.Bg5
 * side line passes 4.h4 h5 on the Tal chapter's main line, so it is the Tal
 * Variation. Where side lines disagree, the most specific name wins.
 */
function positionVariations(
  root: VariationId,
  variations: Readonly<Record<VariationId, Variation>>,
  chapters: readonly Chapter[],
  chapterVariation: readonly VariationId[],
): Map<PositionKey, VariationId> {
  const add = (map: Map<PositionKey, Set<VariationId>>, key: PositionKey, id: VariationId) =>
    map.set(key, (map.get(key) ?? new Set()).add(id));
  const mainLines = new Map<PositionKey, Set<VariationId>>();
  chapters.forEach((chapter, i) => {
    for (const move of mainLine(chapter.moves[0]))
      add(mainLines, positionKey(move.before), chapterVariation[i]);
  });
  const path = (id: VariationId) => ancestry(variations, id);
  const named = new Map([...mainLines].map(([key, ids]) => [key, narrowest([...ids].map(path))]));

  const group = (chapter: VariationId) =>
    variations[chapter].parent === root ? chapter : variations[chapter].parent!;
  const sideLines = new Map<PositionKey, Set<VariationId>>();
  chapters.forEach((chapter, i) => {
    /** The variation of the last main-line position up to each move. */
    const lastNamed = new Map<StudyMove, VariationId>();
    for (const move of chapterMoves(chapter)) {
      const key = positionKey(move.before);
      const own = named.get(key);
      // Only the start has no parent, and every main line passes it.
      const last = own ?? lastNamed.get(move.parent!)!;
      lastNamed.set(move, last);
      if (!own) add(sideLines, key, last === root ? group(chapterVariation[i]) : last);
    }
  });
  for (const [key, ids] of sideLines) {
    const paths = [...ids].map(path);
    const deepest = Math.max(...paths.map(({ length }) => length));
    named.set(key, narrowest(paths.filter(({ length }) => length === deepest)));
  }
  return named;
}

/**
 * The learner's moves the study recommends in `chapter`: at each of the
 * learner's turns, the study's first move unless marked dubious, and any move
 * a choice guide offers. Once the line leaves the recommended moves (a
 * refuted alternative), nothing after it is recommended, while the opponent's
 * alternatives keep the learner's replies. Nor is anything at or after a
 * position that `open` says another source decides.
 */
function bookMoves(
  chapter: Chapter,
  side: Color,
  offered: ReadonlySet<StudyMove>,
  open: (move: StudyMove) => boolean,
): Set<StudyMove> {
  const book = new Set<StudyMove>();
  const visit = (moves: readonly StudyMove[]) => {
    moves.forEach((move, i) => {
      if (move.before.turn !== side) return visit(move.children);
      if (!open(move) || (!offered.has(move) && (i > 0 || isDubious(move)))) return;
      book.add(move);
      visit(move.children);
    });
  };
  visit(chapter.moves);
  return book;
}

/**
 * Adds `note` from `source` to a move's or position's notes, once. A later
 * source only explains what no earlier one did: guides tend to say the same
 * thing about the same move, and the learner would read it once per guide.
 */
function addNote(spot: { notes: Note[]; noteSource?: number }, note: Note, source: number) {
  spot.noteSource ??= source;
  if (spot.noteSource !== source) return;
  const same = JSON.stringify(note);
  if (!spot.notes.some((other) => JSON.stringify(other) === same)) spot.notes.push(note);
}

function finish(draft: DraftPosition, variation: VariationId): LessonPosition {
  const moves = [...draft.moves.values()];
  return {
    variation,
    // Book moves first, then in study order (sort is stable).
    moves: moves
      .sort((a, b) => Number(b.book) - Number(a.book))
      .map(({ uci, book, risk, notes }) => ({
        uci,
        ...(book && { book }),
        ...(risk && { risk }),
        ...(notes.length > 0 && { notes }),
      })),
    ...(draft.notes.length > 0 && { notes: draft.notes }),
  };
}

/**
 * The variation a chapter title names, as "Group: Variation" (the part before
 * the colon groups chapters), or undefined for a chapter about the opening
 * itself. Each study titles its chapters its own way (studies.ts).
 */
export type ChapterName = (title: string, chapter: Chapter) => string | undefined;

/**
 * Chapter titles like "🔵 01 Exchange Variation: Rubinstein Variation (I)":
 * the colour and number go, and numbered parts (I), (II) are one.
 */
export const numberedChapterName: ChapterName = (title) =>
  title.replace(/^\P{L}*\d+\s+/u, '').replace(/\s+\((?:I|II|III|IV|V)\)$/, '');

function chapterVariations(
  info: LessonInfo,
  chapters: readonly Chapter[],
  chapterName: ChapterName,
) {
  const variations: Record<VariationId, Variation> = {
    [info.id]: { name: info.title },
  };
  const chapterVariation = chapters.map((chapter) => {
    const name = chapterName(chapter.title, chapter);
    if (name === undefined) return info.id;
    const [group] = name.includes(':') ? name.split(/:\s*/, 2) : [undefined];
    let parent = info.id;
    if (group) {
      parent = slug(group);
      variations[parent] ??= { name: group, parent: info.id };
    }
    // The full name, since many chapter names ("Other Fourth Moves") need their group.
    const id = slug(name);
    variations[id] ??= { name, parent };
    return id;
  });
  return { variations, chapterVariation };
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The variations from the opening down to `id`. */
function ancestry(
  variations: Readonly<Record<VariationId, Variation>>,
  id: VariationId,
): VariationId[] {
  const path: VariationId[] = [];
  for (let at: VariationId | undefined = id; at; at = variations[at].parent) path.unshift(at);
  return path;
}

/** The narrowest variation on every one of `paths`: at least one, each from `ancestry`, so all start at the opening. */
function narrowest(paths: readonly (readonly VariationId[])[]): VariationId {
  const [first] = paths;
  let level = 0;
  while (level + 1 < first.length && paths.every((path) => path[level + 1] === first[level + 1]))
    level++;
  return first[level];
}
