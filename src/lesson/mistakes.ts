/**
 * Marked mistakes (`LessonMove.mistake`) read from the guide tree: the line
 * each one starts (its stored `line`, else the guide's choice rule), and a
 * note's reference to one (`MistakeIdea`) as the trap the board draws and
 * plays back. The `Trap` is derived on demand, never stored: the marker and
 * the guide's moves are the one home of a trap's line.
 */
import { parseUci } from 'chessops/util';

import { type Color, keyTurn, opposite, positionKey, readPositionKey } from '@/game/replay';

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
import { sameLine } from './openings';
import { guideMove } from './select';
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

/** How many of `moves` `line` plays from its move `from` on: "Nxe5 c6 Bc4" on a line that played "Nxe5 c6 Nf3" plays 2. */
export function followedMoves(moves: readonly Uci[], line: readonly Uci[], from: number): number {
  const missed = moves.findIndex((uci, step) => uci !== line[from + step]);
  return missed === -1 ? moves.length : missed;
}

/** What a note shown on the board draws: its ideas, with each mistake it names read as its trap. */
export type BoardIdea = Exclude<Idea, MistakeIdea> | Trap;

/** A note as the board shows it (`boardNote`). */
export type BoardNote = Note<BoardIdea>;

/**
 * The guide's moves at `key` in the order a mistake's line picks from them:
 * where the learner punishes, its book moves, or off the book, where it has
 * none, every move it doesn't mark as a mistake; where the opponent punishes,
 * every move it doesn't mark; where the erring side is to move, every move.
 * Most played first over every band; ties, and moves without counts, keep the
 * file's order. Act III picks the same way (docs/plans/opportunities.md).
 * Example: past 5...Qc8, a move Black's guide doesn't book, 6.Qxd5? Qxc1#
 * follows the guide's 6...Qxc1#.
 */
export function guideOrder(
  lesson: Lesson,
  key: PositionKey,
  punishing: Color,
): readonly LessonMove[] {
  const moves = lesson.positions[key]?.moves ?? [];
  const toMove = keyTurn(key);
  const book = moves.filter((move) => move.book);
  const played =
    toMove !== punishing
      ? moves
      : toMove === lesson.side && book.length > 0
        ? book
        : moves.filter((move) => !move.mistake);
  // Array.sort is stable, so equal counts keep the file's order.
  return [...played].sort((a, b) => (moveGames(b, 'all') ?? -1) - (moveGames(a, 'all') ?? -1));
}

/**
 * The line that `move`, a marked mistake at `key`, starts: the move, then
 * its stored line (`Mistake.line`), or else the guide's (`guideLine`).
 * Example: a marked 5.e6? with only 5...fxe6 after it in the guide, and
 * nothing after that, starts the line 5.e6 fxe6.
 */
export function mistakeLine(lesson: Lesson, key: PositionKey, move: LessonMove): Uci[] {
  return move.mistake?.line ? [move.uci, ...move.mistake.line] : guideLine(lesson, key, move.uci);
}

/**
 * The line a mark on `uci` at `key` starts by the guide's choice rule alone
 * (`guideOrder`), whatever line the mark stores: `uci`, then at each position
 * the first of the guide's moves there, ending where the guide has no move to
 * pick, before any illegal move (`uci` included, giving none; the checker
 * reports it), or once it comes back to a position it passed.
 */
export function guideLine(lesson: Lesson, key: PositionKey, uci: Uci): Uci[] {
  const pos = readPositionKey(key)!;
  const punishing = opposite(pos.turn);
  const line: Uci[] = [];
  const passed = new Set([key]);
  for (let next: Uci | undefined = uci; next !== undefined;) {
    const move = parseUci(next);
    if (!move || !pos.isLegal(move)) break;
    pos.play(move);
    line.push(next);
    const at = positionKey(pos);
    if (passed.has(at)) break;
    passed.add(at);
    next = guideOrder(lesson, at, punishing)[0]?.uci;
  }
  return line;
}

/** Whether `line`, from `key`, is the one the guide's choice rule gives, so a mark stores none. */
export const isGuideLine = (lesson: Lesson, key: PositionKey, line: readonly Uci[]) =>
  sameLine(guideLine(lesson, key, line[0]), line);

/** A mark's id: the position its move is played in, and the move. */
export const markId = (key: PositionKey, uci: Uci) => `${key} ${uci}`;

/** The trap a note's reference names: `uci`, the guide's move at `key`, and its line. */
function trapAt(lesson: Lesson, key: PositionKey, uci: Uci): Trap {
  let byKey = traps.get(lesson);
  if (!byKey) traps.set(lesson, (byKey = new Map()));
  const id = markId(key, uci);
  let trap = byKey.get(id);
  if (!trap) {
    // checkLesson proves the reference names a marked guide move here.
    const move = guideMove(lesson, key, uci);
    if (!move?.mistake) throw new Error(`No marked guide move ${uci} at ${key}`);
    trap = {
      type: 'trap',
      moves: mistakeLine(lesson, key, move),
      ...(move.mistake.verdict && { verdict: move.mistake.verdict }),
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
