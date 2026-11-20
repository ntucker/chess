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
import { withTitleMoves } from './titleMoves';

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

/** What one source gave the lesson, and what earlier sources kept out. */
export interface SourceTally {
  /** Learner's moves it was first to recommend. */
  booked: number;
  /** Learner's moves it recommends where an earlier source recommends another, as `fen uci`. */
  readonly blocked: Set<string>;
  notes: number;
  /** Notes left out because an earlier source explained the same move or position. */
  notesSkipped: number;
}

/**
 * The lesson for `chapters`, with `extracted[i]` read from `chapters[i]`;
 * `tally[source]` counts what each source gave.
 */
export function mergeChapters(
  info: LessonInfo,
  chapters: readonly Chapter[],
  extracted: readonly ChapterNotes[],
  chapterName: ChapterName = numberedChapterName,
  tally: SourceTally[] = [],
): Lesson {
  if (chapters.length === 0) throw new Error(`No chapters to merge for lesson ${info.id}`);
  const start = chapters[0].start;
  if (chapters.some((chapter) => positionKey(chapter.start) !== positionKey(start))) {
    throw new Error('Every chapter of a lesson must start from the same position');
  }
  const tree = new DraftTree(start);
  chapters.forEach((chapter, i) => {
    const source = chapter.source ?? 0;
    tally[source] ??= { booked: 0, blocked: new Set(), notes: 0, notesSkipped: 0 };
    addChapter(tree, chapter, extracted[i], info.side, tally[source]);
  });
  const { variations, chapterVariation } = chapterVariations(info, chapters, chapterName);
  const titled = chapters.map((chapter, i) =>
    withTitleMoves(chapter, variations[chapterVariation[i]].name),
  );
  const variationOf = sourceVariations(info.id, variations, titled, chapterVariation);
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
  tally: SourceTally,
) {
  const source = chapter.source ?? 0;
  // A later source recommends moves only where no earlier one does, or the same move.
  const say: Say = (move) => {
    const draft = tree.positions.get(positionKey(move.before));
    const bookSource = draft?.bookSource;
    if (bookSource === undefined || bookSource === source) return 'own';
    return draft?.moves.get(move.uci)?.book ? 'agreed' : 'closed';
  };
  const block = (move: StudyMove) => tally.blocked.add(`${positionKey(move.before)} ${move.uci}`);
  const offered = new Set(choices.map((choice) => choice.move));
  const book = bookMoves(chapter, side, offered, say, block);
  const recommend = (move: StudyMove) => {
    const draft = tree.move(move.before, move.uci);
    if (!draft.book) tally.booked++;
    draft.book = true;
    tree.entry(positionKey(move.before)).bookSource ??= source;
  };
  const note = (spot: { notes: Note[]; noteSource?: number }, note: Note, intro?: true) => {
    // A line's introduction leaves the spot to whichever guide explains the move itself.
    if (!intro) spot.noteSource ??= source;
    if (addNote(spot, note, source)) tally.notes++;
    else if (spot.noteSource !== undefined && spot.noteSource !== source) tally.notesSkipped++;
  };
  for (const move of chapterMoves(chapter)) {
    tree.move(move.before, move.uci);
    if (book.has(move)) recommend(move);
  }
  for (const { move, note: text, source: from } of moveNotes)
    note(tree.move(move.before, move.uci), text, from.intro);
  for (const { pos, note: text } of positionNotes) note(tree.entry(positionKey(pos)), text);
  for (const choice of choices) {
    if (say(choice.move) === 'closed') {
      block(choice.move);
      continue;
    }
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
 * The variation of each position the chapters reach (`positionVariations`),
 * adding one source at a time.
 */
function sourceVariations(
  root: VariationId,
  variations: Readonly<Record<VariationId, Variation>>,
  chapters: readonly Chapter[],
  chapterVariation: readonly VariationId[],
): Map<PositionKey, VariationId> {
  const sources = [...new Set(chapters.map(({ source = 0 }) => source))].sort((a, b) => a - b);
  let names: Names = { named: new Map(), onMain: new Set(), claimed: new Set() };
  for (const source of sources) {
    const upTo = chapters.flatMap((chapter, i) => ((chapter.source ?? 0) <= source ? [i] : []));
    names = positionVariations(
      root,
      variations,
      upTo.map((i) => chapters[i]),
      upTo.map((i) => chapterVariation[i]),
      names,
    );
  }
  return names.named;
}

/** The variation of each position, the positions a main line reaches, and those a chapter's name claims. */
interface Names {
  readonly named: Map<PositionKey, VariationId>;
  readonly onMain: Set<PositionKey>;
  readonly claimed: Set<PositionKey>;
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
 * Variation. Where side lines disagree, the most specific name wins, and
 * between as specific ones the first chapter's.
 *
 * Names from earlier sources (`earlier`) stand unless a new one lies within
 * them: a later guide may narrow "Pure Slav" to "Pure Slav: Geller Gambit",
 * but its "Classical Variation" chapter never renames the main guide's
 * "Capablanca Variation", nor does its main line rename a position the main
 * guide reaches by a side line (the Panov chapter's 6.Nf3 a6 7.cxd5 Nxd5
 * stays Panov, though a later guide's Accelerated Panov line reaches it).
 * Only an earlier side line's name follows the line it came through, when
 * that now has a name as narrow on another line: the main Caro-Kann guide
 * reaches 2.Nf3 d5 3.d3 Qc7 by a side line of its Two Knights chapter,
 * through 3.d3, which the Wikibooks 2.d3 Breyer page names.
 */
function positionVariations(
  root: VariationId,
  variations: Readonly<Record<VariationId, Variation>>,
  chapters: readonly Chapter[],
  chapterVariation: readonly VariationId[],
  earlier: Names,
): Names {
  const add = (map: Map<PositionKey, Set<VariationId>>, key: PositionKey, id: VariationId) =>
    map.set(key, (map.get(key) ?? new Set()).add(id));
  const path = (id: VariationId) => ancestry(variations, id);
  const settle = (key: PositionKey, id: VariationId, sideLine: boolean) => {
    const was = earlier.named.get(key);
    // A claim holds only where no main line goes, so it is weighed again with each source.
    if (!was || earlier.claimed.has(key) || path(id).includes(was)) return id;
    const [before, now] = [path(was), path(id)];
    const apart = !within(now, before) && !within(before, now);
    return sideLine && !earlier.onMain.has(key) && apart && now.length >= before.length ? id : was;
  };
  const mainNames = mainLineVariations(variations, chapters, chapterVariation);
  const named = new Map([...mainNames].map(([key, id]) => [key, settle(key, id, false)]));
  // A line a chapter's name claims is its own where no main line goes, if the last named position
  // on the way there lies inside the chapter; the first chapter to claim it wins.
  const namedOnTheWay = (move: StudyMove) => {
    for (let at: StudyMove | undefined = move; at; at = at.parent) {
      const id = named.get(positionKey(at.before));
      if (id) return id;
    }
  };
  const claimed = new Set<PositionKey>();
  chapters.forEach(({ claims = [] }, i) => {
    for (const claim of claims) {
      const from = namedOnTheWay(claim);
      if (from && !path(chapterVariation[i]).includes(from)) continue;
      for (const move of mainLine(claim)) {
        const key = positionKey(move.after);
        if (named.has(key)) continue;
        named.set(key, settle(key, chapterVariation[i], true));
        claimed.add(key);
      }
    }
  });

  // A chapter's group is its widest variation below the opening; a chapter about the opening is its own.
  const group = (chapter: VariationId) => path(chapter)[1] ?? chapter;
  const sideLines = new Map<PositionKey, Set<VariationId>>();
  chapters.forEach((chapter, i) => {
    /** The variation of the last main-line position up to each move. */
    const lastNamed = new Map<StudyMove, VariationId>();
    /** The move into the chapter's named position (`Chapter.namedFrom`), and the moves after it. */
    const main = new Set(mainLine(chapter.moves[0]));
    const past = new Set<StudyMove>();
    for (const move of chapterMoves(chapter)) {
      const key = positionKey(move.before);
      const own = named.get(key);
      const last = own ?? (move.parent ? lastNamed.get(move.parent)! : root);
      lastNamed.set(move, last);
      const after = !!move.parent && past.has(move.parent);
      if (after || (main.has(move) && move.ply === chapter.namedFrom)) past.add(move);
      // Before its named position, a chapter's side lines are not its group's.
      const ours = !chapter.namedFrom || after;
      if (!own) add(sideLines, key, last === root && ours ? group(chapterVariation[i]) : last);
    }
  });
  for (const [key, ids] of sideLines) {
    const deepest = [...ids].reduce((a, b) => (path(b).length > path(a).length ? b : a));
    named.set(key, settle(key, deepest, true));
  }
  return { named, onMain: new Set([...earlier.onMain, ...mainNames.keys()]), claimed };
}

/**
 * Who decides whether a learner's move is recommended: this source (`own`),
 * an earlier source that recommends it (`agreed`), or an earlier source that
 * recommends something else there (`closed`).
 */
type Say = (move: StudyMove) => 'own' | 'agreed' | 'closed';

/**
 * The learner's moves the study recommends in `chapter`: at each of the
 * learner's turns, the study's first move unless marked dubious, and any move
 * a choice guide offers. Once the line leaves the recommended moves (a
 * refuted alternative), nothing after it is recommended, while the opponent's
 * alternatives keep the learner's replies. Where an earlier source decides
 * (`say`), only the moves it recommends are followed, whatever this chapter
 * thinks of them; `block` hears of each move this chapter recommends that an
 * earlier source decides against.
 */
function bookMoves(
  chapter: Chapter,
  side: Color,
  offered: ReadonlySet<StudyMove>,
  say: Say,
  block: (move: StudyMove) => void,
): Set<StudyMove> {
  const book = new Set<StudyMove>();
  // A chapter written for the other side recommends its own moves, not the learner's, unless told.
  const recommends = chapter.writtenFor === undefined || chapter.recommends === true;
  const visit = (moves: readonly StudyMove[]) => {
    moves.forEach((move, i) => {
      if (move.before.turn !== side) return visit(move.children);
      const recommended = recommends && (offered.has(move) || (i === 0 && !isDubious(move)));
      const decided = say(move);
      if (decided === 'closed') {
        if (recommended) block(move);
        return;
      }
      if (decided === 'own' && !recommended) return;
      book.add(move);
      visit(move.children);
    });
  };
  visit(chapter.moves);
  return book;
}

/**
 * Adds `note` from `source` to a move's or position's notes, once, and says
 * whether it did. Guides tend to say the same thing about the same move, so
 * only the source that first explained a spot (its `noteSource`) adds to it;
 * a spot nobody has explained yet takes anyone's note. Setting `noteSource`
 * is the caller's job: a line's introduction leaves the spot open.
 */
function addNote(
  spot: { notes: Note[]; noteSource?: number },
  note: Note,
  source: number,
): boolean {
  if (spot.noteSource !== undefined && spot.noteSource !== source) return false;
  const same = JSON.stringify(note);
  if (spot.notes.some((other) => JSON.stringify(other) === same)) return false;
  spot.notes.push(note);
  return true;
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
    // Each colon opens a narrower group: "Pure Slav: Alapin Variation: Dutch
    // Variation" is a line of the Alapin, itself a line of the Pure Slav. Below
    // the top group a name keeps the top group's, since many chapter names
    // ("Other Fourth Moves") need it.
    const [top, ...narrower] = name.split(/:\s*/);
    let parent = info.id;
    let id = slug(top);
    variations[id] ??= { name: top, parent };
    narrower.forEach((part, i) => {
      parent = id;
      id = slug([top, ...narrower.slice(0, i + 1)].join(': '));
      variations[id] ??= { name: `${top}: ${part}`, parent };
    });
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

/**
 * The variation of each position on a chapter's main line: the narrowest
 * holding every chapter whose main line reaches it. A chapter cut out of a
 * longer line at a named position (`Chapter.namedFrom`) names its own moves
 * where it lies inside all those chapters: the Wikibooks Dutch Variation
 * from 6.e3, over the Alapin chapter whose main line goes the same way. And
 * a line that passed a narrower name keeps it while the chapters there all
 * hold it: past the Dutch chapter's end, the Alapin chapter's main line is
 * still the Dutch Variation.
 */
function mainLineVariations(
  variations: Readonly<Record<VariationId, Variation>>,
  chapters: readonly Chapter[],
  chapterVariation: readonly VariationId[],
): Map<PositionKey, VariationId> {
  const path = (id: VariationId) => ancestry(variations, id);
  interface Reached {
    readonly ply: number;
    readonly paths: VariationId[][];
    readonly cut: VariationId[][];
    readonly from: PositionKey[];
  }
  const reached = new Map<PositionKey, Reached>();
  chapters.forEach((chapter, i) => {
    let from: PositionKey | undefined;
    const own = path(chapterVariation[i]);
    for (const move of mainLine(chapter.moves[0])) {
      // Before its named position, a chapter's main line is its parent variation's, or other chapters'.
      const named = move.ply > (chapter.namedFrom ?? 0);
      if (!named && chapter.cut) continue;
      const key = positionKey(move.before);
      const at = reached.get(key) ?? { ply: move.ply, paths: [], cut: [], from: [] };
      reached.set(key, at);
      at.paths.push(named || own.length === 1 ? own : own.slice(0, -1));
      if (chapter.namedFrom && named) at.cut.push(own);
      if (from) at.from.push(from);
      from = key;
    }
  });
  const named = new Map<PositionKey, VariationId>();
  for (const [key, { paths, cut, from }] of [...reached].sort(([, a], [, b]) => a.ply - b.ply)) {
    const holds = (name: readonly VariationId[]) => paths.every((chapter) => within(chapter, name));
    const passed = from.flatMap((before) => (named.has(before) ? [path(named.get(before)!)] : []));
    named.set(
      key,
      deepest([path(narrowest(paths)), ...cut.filter(holds), ...passed.filter(holds)]),
    );
  }
  return named;
}

/** Of `paths`, `ancestry`s inside the first, the deepest where they all lie on one line, else the first. */
function deepest(paths: readonly (readonly VariationId[])[]): VariationId {
  const longest = paths.reduce((a, b) => (b.length > a.length ? b : a));
  return (paths.every((path) => within(path, longest)) ? longest : paths[0]).at(-1)!;
}

/** Whether `inner` (an `ancestry`) lies within `outer`. */
const within = (outer: readonly VariationId[], inner: readonly VariationId[]) =>
  outer.every((id, i) => inner[i] === id);

/** The narrowest variation on every one of `paths`: at least one, each from `ancestry`, so all start at the opening. */
function narrowest(paths: readonly (readonly VariationId[])[]): VariationId {
  const [first] = paths;
  let level = 0;
  while (level + 1 < first.length && paths.every((path) => path[level + 1] === first[level + 1]))
    level++;
  return first[level];
}
