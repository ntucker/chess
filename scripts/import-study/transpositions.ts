/**
 * Notes a guide wrote on a move order the lesson doesn't play. A study that
 * reaches the Semi-Slav by 2...e6 3.Nc3 c6 explains it on 3...c6, but the
 * lesson's learner gets there by 2...c6 3.Nc3 e6 and never sees that move's
 * notes. Where a move from a position the learner never reaches leads to one
 * they do, and nothing explains it there, its notes become that position's
 * own, which the app shows however the position was reached. A move the
 * learner could play but the book rejects keeps its notes: they judge the
 * move ("playable, but gives up half a pawn"), not where it leads.
 */
import { parsePositionKey, positionKey } from '@/game/replay';
import { inCleanRun } from '@/lesson/cleanRun';
import type { Lesson, LessonMove, PositionKey } from '@/lesson/lesson';

import { bookReach } from './engineCheck';
import { played } from './study';

/** `lesson` with notes moved across transpositions, and how many moved. */
export function noteTranspositions(lesson: Lesson): { lesson: Lesson; moved: number } {
  const reach = bookReach(lesson);
  const moves = [...allMoves(lesson)];
  /** Positions the learner reaches where a move on the book path already explains how. */
  const explained = new Set(
    moves
      .filter(({ key, move, learner }) => reach.has(key) && inCleanRun(move, learner))
      .filter(({ move }) => move.notes?.length)
      .map(({ after }) => after),
  );
  const found = new Map<PositionKey, { key: PositionKey; move: LessonMove }>();
  for (const { key, move, after } of moves) {
    if (reach.has(key) || !move.notes?.length || !reach.has(after) || explained.has(after))
      continue;
    const there = lesson.positions[after];
    if (!there || there.notes?.length || found.has(after)) continue;
    found.set(after, { key, move });
  }
  if (found.size === 0) return { lesson, moved: 0 };
  const positions = { ...lesson.positions };
  for (const [after, { key, move }] of found) {
    const from = positions[key];
    positions[key] = { ...from, moves: from.moves.map((m) => (m === move ? withoutNotes(m) : m)) };
    positions[after] = { ...positions[after], notes: move.notes };
  }
  return { lesson: { ...lesson, positions }, moved: found.size };
}

function withoutNotes({ notes: _, ...move }: LessonMove): LessonMove {
  return move;
}

/** Every move in `lesson`, with its position, whether the learner plays it, and the position it reaches. */
export function* allMoves(lesson: Lesson): Generator<{
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
