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
export type LessonInfo = Pick<Lesson, 'id' | 'title' | 'side' | 'source'>;

interface DraftMove {
  readonly uci: Uci;
  book: boolean;
  risk?: Risk;
  readonly notes: Note[];
}

interface DraftPosition {
  readonly moves: Map<Uci, DraftMove>;
  readonly notes: Note[];
}

/** The lesson for `chapters`, with `extracted[i]` read from `chapters[i]`. */
export function mergeChapters(
  info: LessonInfo,
  chapters: readonly Chapter[],
  extracted: readonly ChapterNotes[],
): Lesson {
  const { variations, chapterVariation } = chapterVariations(info, chapters);
  const positions = new Map<PositionKey, DraftPosition>();
  const entry = (key: PositionKey) => {
    let draft = positions.get(key);
    if (!draft) positions.set(key, (draft = { moves: new Map(), notes: [] }));
    return draft;
  };
  const draftMove = (pos: Chess, uci: Uci) => {
    const moves = entry(positionKey(pos)).moves;
    let move = moves.get(uci);
    if (!move) moves.set(uci, (move = { uci, book: false, notes: [] }));
    return move;
  };
  const start = chapters[0].start;
  if (chapters.some((chapter) => positionKey(chapter.start) !== positionKey(start))) {
    throw new Error('Every chapter of a lesson must start from the same position');
  }
  const startKey = positionKey(start);
  entry(startKey);

  chapters.forEach((chapter, i) => {
    const { notes, choices } = extracted[i];
    const book = bookMoves(chapter, info.side, new Set(choices.map((choice) => choice.move)));
    for (const move of chapterMoves(chapter)) draftMove(move.before, move.uci).book ||= book.has(move);
    for (const { move, note } of notes) addNote(move ? draftMove(move.before, move.uci).notes : entry(startKey).notes, note);
    for (const choice of choices) {
      const move = draftMove(choice.move.before, choice.move.uci);
      move.book = true;
      move.risk ??= choice.risk;
    }
  });

  const variationOf = positionVariations(info.id, variations, chapters, chapterVariation);
  // Sequences from comment text: the variation of the position they leave from.
  for (const { branches } of extracted) {
    for (const { spot, ucis } of branches) {
      let pos = spot.pos;
      // A sequence may leave from where the study stops: then the variation of the move into it.
      const variation =
        variationOf.get(positionKey(pos)) ?? (spot.move && variationOf.get(positionKey(spot.move.before))) ?? info.id;
      for (const uci of ucis) {
        const key = positionKey(pos);
        if (!variationOf.has(key)) variationOf.set(key, variation);
        draftMove(pos, uci);
        pos = played(pos, uci);
      }
    }
  }
  // A position the guide stops at needs no entry unless it has notes.
  for (const [key, draft] of positions) {
    if (draft.moves.size === 0 && draft.notes.length === 0 && key !== startKey) positions.delete(key);
  }

  return {
    format: LESSON_FORMAT,
    id: info.id,
    title: info.title,
    side: info.side,
    start: makeFen(start.toSetup()),
    source: info.source,
    variations,
    positions: Object.fromEntries(
      [...positions].map(([key, draft]) => [key, finish(draft, variationOf.get(key) ?? info.id)]),
    ),
  };
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
    for (const move of mainLine(chapter.moves[0])) add(mainLines, positionKey(move.before), chapterVariation[i]);
  });
  const named = new Map([...mainLines].map(([key, ids]) => [key, narrowest(variations, ids, root)]));

  const group = (chapter: VariationId) => (variations[chapter].parent === root ? chapter : variations[chapter].parent!);
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
    const deepest = Math.max(...[...ids].map((id) => depth(variations, id)));
    named.set(key, narrowest(variations, new Set([...ids].filter((id) => depth(variations, id) === deepest)), root));
  }
  return named;
}

/**
 * The learner's moves the study recommends in `chapter`: at each of the
 * learner's turns, the study's first move unless marked dubious, and any move
 * a choice guide offers. Once the line leaves the recommended moves (a
 * refuted alternative), nothing after it is recommended, while the opponent's
 * alternatives keep the learner's replies.
 */
function bookMoves(chapter: Chapter, side: Color, offered: ReadonlySet<StudyMove>): Set<StudyMove> {
  const book = new Set<StudyMove>();
  const visit = (moves: readonly StudyMove[]) => {
    moves.forEach((move, i) => {
      if (move.before.turn !== side) return visit(move.children);
      if (!offered.has(move) && (i > 0 || isDubious(move))) return;
      book.add(move);
      visit(move.children);
    });
  };
  visit(chapter.moves);
  return book;
}

function addNote(notes: Note[], note: Note) {
  const same = JSON.stringify(note);
  if (!notes.some((other) => JSON.stringify(other) === same)) notes.push(note);
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
 * Variations from chapter titles like "🔵 01 Exchange Variation: Rubinstein
 * Variation (I)": the part before the colon groups chapters, the part after
 * names the chapter's own variation, and numbered parts (I), (II) are one.
 */
function chapterVariations(info: LessonInfo, chapters: readonly Chapter[]) {
  const variations: Record<VariationId, Variation> = { [info.id]: { name: info.title } };
  const chapterVariation = chapters.map(({ title }) => {
    const name = title.replace(/^\P{L}*\d+\s+/u, '').replace(/\s+\((?:I|II|III|IV|V)\)$/, '');
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

/** How many parents `id` has. */
function depth(variations: Readonly<Record<VariationId, Variation>>, id: VariationId) {
  let count = 0;
  for (let at = variations[id].parent; at; at = variations[at].parent) count++;
  return count;
}

/** The narrowest variation that holds all of `ids`. */
function narrowest(variations: Readonly<Record<VariationId, Variation>>, ids: ReadonlySet<VariationId>, root: VariationId) {
  const chain = (id: VariationId) => {
    const path: VariationId[] = [];
    for (let at: VariationId | undefined = id; at; at = variations[at].parent) path.unshift(at);
    return path;
  };
  const paths = [...ids].map(chain);
  if (paths.length === 0) return root;
  let common = root;
  for (let depth = 0; paths.every((path) => path[depth] !== undefined && path[depth] === paths[0][depth]); depth++) {
    common = paths[0][depth];
  }
  return common;
}

