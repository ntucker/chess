/**
 * Every note of a lesson, with where it sits, for the conversion review page:
 * the study's words beside what the lesson shows and draws.
 */
import type { Chess } from 'chessops/chess';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { parsePosition, positionKey } from '@/game/replay';
import type { Idea, Lesson, Note, PositionKey, Uci } from '@/lesson/lesson';

export interface ReviewItem {
  /** Unique within the lesson. */
  readonly key: string;
  /** The moves from the start to the note's position, in SAN: `1.e4 c6 2.d4`. */
  readonly line: string;
  readonly variation: string;
  readonly note: Note;
  /** The position the note's ideas are drawn in: the note's own, or the one after its move. */
  readonly position: Chess;
  /** The note's move, for a note on a move. */
  readonly move?: Uci;
  readonly kind: ReviewKind;
}

/** What a note shows: something drawn on the board, only an evaluation badge, or text alone. */
export type ReviewKind = 'drawn' | 'badge' | 'text';

export const reviewKind = (ideas: readonly Idea[] = []): ReviewKind =>
  ideas.some((idea) => idea.type !== 'evaluation') ? 'drawn' : ideas.length > 0 ? 'badge' : 'text';

/** The notes of `lesson`, in the order a walk from the start first reaches their positions. */
export function reviewItems(lesson: Lesson): ReviewItem[] {
  const start = parsePosition(lesson.start)!;
  const items: ReviewItem[] = [];
  const seen = new Set<PositionKey>([positionKey(start)]);
  const queue: { pos: Chess; sans: string[] }[] = [{ pos: start, sans: [] }];
  for (let at = queue.shift(); at; at = queue.shift()) {
    const key = positionKey(at.pos);
    const entry = lesson.positions[key];
    if (!entry) continue;
    const variation = lesson.variations[entry.variation]?.name ?? entry.variation;
    const add = (note: Note, i: number, position: Chess, sans: string[], move?: Uci) =>
      items.push({
        key: `${key} ${move ?? ''} ${i}`,
        line: numbered(sans),
        variation,
        note,
        position,
        move,
        kind: reviewKind(note.ideas),
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

/** `sans` numbered from the first move: `1.e4 c6 2.d4`. */
function numbered(sans: readonly string[]): string {
  return sans.map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san)).join(' ');
}
