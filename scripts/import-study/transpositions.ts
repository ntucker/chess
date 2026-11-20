/**
 * Notes a guide wrote on a move order the lesson doesn't play. A study that
 * reaches the Semi-Slav by 2...e6 3.Nc3 c6 explains it on 3...c6, but the
 * lesson's learner gets there by 2...c6 3.Nc3 e6 and never sees that move's
 * notes. Where a move off the book path leads to a position the learner does
 * reach and nothing explains it there, its notes become that position's own,
 * which the app shows however the position was reached.
 */
import { parsePositionKey, positionKey } from '@/game/replay';
import type { Lesson, LessonMove, Note, PositionKey } from '@/lesson/lesson';

import { bookReach } from './engineCheck';
import { played } from './study';

/** `lesson` with notes moved across transpositions, and how many moved. */
export function noteTranspositions(lesson: Lesson): { lesson: Lesson; moved: number } {
  const reach = bookReach(lesson);
  const moves = [...allMoves(lesson)];
  const onBook = ({ key, move, learner }: (typeof moves)[number]) =>
    reach.has(key) && (!learner || !!move.book);
  /** Positions the learner reaches where a move on the book path already explains how. */
  const explained = new Set(
    moves.filter((at) => onBook(at) && at.move.notes?.length).map(({ after }) => after),
  );
  const found = new Map<PositionKey, { key: PositionKey; uci: string; notes: readonly Note[] }>();
  for (const at of moves) {
    const { key, move, after } = at;
    if (onBook(at) || !move.notes?.length || !reach.has(after) || explained.has(after)) continue;
    const there = lesson.positions[after];
    if (!there || there.notes?.length || found.has(after)) continue;
    found.set(after, { key, uci: move.uci, notes: move.notes });
  }
  if (found.size === 0) return { lesson, moved: 0 };
  const positions = { ...lesson.positions };
  for (const [after, { key, uci, notes }] of found) {
    const from = positions[key];
    positions[key] = {
      ...from,
      moves: from.moves.map((move) => (move.uci === uci ? withoutNotes(move) : move)),
    };
    positions[after] = { ...positions[after], notes };
  }
  return { lesson: { ...lesson, positions }, moved: found.size };
}

function withoutNotes({ notes: _, ...move }: LessonMove): LessonMove {
  return move;
}

function* allMoves(lesson: Lesson): Generator<{
  key: PositionKey;
  move: LessonMove;
  learner: boolean;
  after: PositionKey;
}> {
  for (const [key, position] of Object.entries(lesson.positions)) {
    const pos = parsePositionKey(key)!;
    for (const move of position.moves)
      yield {
        key,
        move,
        learner: pos.turn === lesson.side,
        after: positionKey(played(pos, move.uci)),
      };
  }
}
