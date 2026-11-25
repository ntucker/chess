/**
 * Marked mistakes (`LessonMove.mistake`) read from the guide tree: the line
 * each one starts, and a note's reference to one (`MistakeIdea`) as the trap
 * the board draws and plays back. Derived on demand, never stored: the
 * marker and the guide's moves are the one home of a trap's line.
 */
import { parseUci } from 'chessops/util';

import { type Color, opposite, positionKey, readPositionKey } from '@/game/replay';

import type {
  Idea,
  Lesson,
  LessonMove,
  Mistake,
  MistakeIdea,
  Note,
  PositionKey,
  Uci,
} from './lesson';
import { moveGames } from './share';

/** A marked mistake's line, as the board draws and plays it back. */
export interface Trap {
  readonly type: 'trap';
  /** The marked move, then the guide's moves after it (`mistakeLine`). */
  readonly moves: readonly Uci[];
  readonly verdict?: Mistake['verdict'];
  /** The learner's side plays the mistake: a trap the learner can fall into, not an opportunity. */
  readonly learnerFalls: boolean;
}

/** What a note shown on the board draws: its ideas, with each mistake it names read as its trap. */
export type BoardIdea = Exclude<Idea, MistakeIdea> | Trap;

/** A note as the board shows it (`boardNote`). */
export type BoardNote = Note<BoardIdea>;

/**
 * The guide's moves at `key` in the order a mistake's line picks from them:
 * where the learner punishes, its book moves, or every move off the book,
 * where it has none; elsewhere every move. Most played first over every
 * band; ties, and moves without counts, keep the file's order. Act III picks
 * the same way (docs/plans/opportunities.md). Example: past 5...Qc8, a move
 * Black's guide doesn't book, 6.Qxd5? Qxc1# follows the guide's 6...Qxc1#.
 */
export function guideOrder(
  lesson: Lesson,
  key: PositionKey,
  punishing: Color,
): readonly LessonMove[] {
  const moves = lesson.positions[key]?.moves ?? [];
  const book = moves.filter((move) => move.book);
  const toMove = readPositionKey(key)!.turn;
  const played = toMove === punishing && toMove === lesson.side && book.length ? book : moves;
  // Array.sort is stable, so equal counts keep the file's order.
  return [...played].sort((a, b) => (moveGames(b, 'all') ?? -1) - (moveGames(a, 'all') ?? -1));
}

/**
 * The line that `move`, a marked mistake at `key`, starts: the move, then at
 * each position the first of the guide's moves there (`guideOrder`). It ends
 * after `Mistake.plies` moves, where the guide has no move to pick, or where
 * it comes back to a position it passed. Example: a marked 5.e6?
 * with only 5...fxe6 after it in the guide, and nothing after that, starts
 * the line 5.e6 fxe6.
 */
export function mistakeLine(lesson: Lesson, key: PositionKey, move: LessonMove): Uci[] {
  const pos = readPositionKey(key)!;
  const punishing = opposite(pos.turn);
  const limit = move.mistake?.plies ?? Infinity;
  const line: Uci[] = [];
  const passed = new Set([key]);
  for (let uci: Uci | undefined = move.uci; uci !== undefined && line.length < limit;) {
    pos.play(parseUci(uci)!);
    line.push(uci);
    const at = positionKey(pos);
    if (passed.has(at)) break;
    passed.add(at);
    uci = guideOrder(lesson, at, punishing)[0]?.uci;
  }
  return line;
}

/** The trap a note's reference names: `uci`, the guide's move at `key`, and its line. */
function trapAt(lesson: Lesson, key: PositionKey, uci: Uci): Trap {
  let byKey = traps.get(lesson);
  if (!byKey) traps.set(lesson, (byKey = new Map()));
  const id = `${key} ${uci}`;
  let trap = byKey.get(id);
  if (!trap) {
    // checkLesson proves the reference names a marked guide move here.
    const move = lesson.positions[key]?.moves.find((guide) => guide.uci === uci) ?? { uci };
    trap = {
      type: 'trap',
      moves: mistakeLine(lesson, key, move),
      ...(move.mistake?.verdict && { verdict: move.mistake.verdict }),
      learnerFalls: readPositionKey(key)!.turn === lesson.side,
    };
    byKey.set(id, trap);
  }
  return trap;
}

/** `trapAt` answers by lesson: a lesson never changes, and the screen asks on every render. */
const traps = new WeakMap<Lesson, Map<string, Trap>>();

/**
 * `note`, checked at `at` (its position, or the position after its move), as
 * the board shows it: each mistake it names read as that mistake's trap.
 * The same object every time, so the screen can tell notes apart by identity;
 * a note that names none is itself.
 */
export function boardNote(lesson: Lesson, note: Note, at: PositionKey): BoardNote {
  if (!note.ideas?.some(({ type }) => type === 'mistake')) return note as BoardNote;
  let byNote = boardNotes.get(lesson);
  if (!byNote) boardNotes.set(lesson, (byNote = new WeakMap()));
  let shown = byNote.get(note);
  if (!shown) {
    const ideas = note.ideas.map((idea) =>
      idea.type === 'mistake' ? trapAt(lesson, at, idea.move) : idea,
    );
    byNote.set(note, (shown = { ...note, ideas }));
  }
  return shown;
}

/** `boardNote` answers by lesson and note: a note sits in one place, so it has one `at`. */
const boardNotes = new WeakMap<Lesson, WeakMap<Note, BoardNote>>();
