/**
 * Every note of a lesson, with where it sits, for the conversion review page:
 * the study's words beside what the lesson shows and draws.
 */
import type { Chess } from 'chessops/chess';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { numberedLine, parsePosition, positionKey } from '@/game/replay';
import { noteShows, type Lesson, type Note, type NoteShows, type PositionKey, type Uci } from '@/lesson/lesson';
import { type BoardNote, boardNote } from '@/lesson/mistakes';

export interface ReviewItem {
  /** Unique within the lesson. */
  readonly key: string;
  /** The moves from the start to the note's position, in SAN: `1.e4 c6 2.d4`. */
  readonly line: string;
  readonly variation: string;
  /** The note as the board shows it: a mistake it names is that mistake's trap. */
  readonly note: BoardNote;
  /** The position the note's ideas are drawn in: the note's own, or the one after its move. */
  readonly position: Chess;
  /** The note's move, for a note on a move. */
  readonly move?: Uci;
  readonly kind: NoteShows;
}

/** The notes of `lesson`, in the order a walk from the start first reaches their positions. */
export function reviewItems(lesson: Lesson): ReviewItem[] {
  const start = parsePosition(lesson.start)!;
  const items: ReviewItem[] = [];
  const seen = new Set<PositionKey>([positionKey(start)]);
  const queue: { pos: Chess; sans: string[] }[] = [{ pos: start, sans: [] }];
  // A first-in, first-out walk: `for...of` also visits the entries pushed while it runs.
  for (const at of queue) {
    const key = positionKey(at.pos);
    const entry = lesson.positions[key];
    if (!entry) continue;
    const variation = lesson.variations[entry.variation]?.name ?? entry.variation;
    const add = (note: Note, i: number, position: Chess, sans: string[], move?: Uci) =>
      items.push({
        key: `${key} ${move ?? ''} ${i}`,
        line: numberedLine(sans),
        variation,
        note: boardNote(lesson, note, positionKey(position)),
        position,
        move,
        kind: noteShows(note.ideas),
      });
    entry.notes?.forEach((note, i) => add(note, i, at.pos, at.sans));
    for (const move of entry.moves) {
      const after = at.pos.clone();
      const san = makeSanAndPlay(after, parseUci(move.uci)!);
      const sans = [...at.sans, san];
      move.notes?.forEach((note, i) => add(note, i, after, sans, move.uci));
      const next = positionKey(after);
      if (!seen.has(next)) {
        seen.add(next);
        queue.push({ pos: after, sans });
      }
    }
  }
  return items;
}
