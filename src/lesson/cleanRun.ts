/**
 * The moves a clean Practice run can play (tech plan section 6): any of the
 * opponent's, and only the learner's book moves. Both the candidate rows'
 * passed marks (`marks.ts`) and the lesson index's line ends (`openings.ts`)
 * walk the guide by this one rule, so the two always agree.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { positionKey, readPositionKey } from '@/game/replay';

import type { Lesson, LessonMove, PositionKey } from './lesson';
import { guidePosition } from './select';

/** Any opponent's move can be part of a clean run; of the learner's, only book moves. */
export const inCleanRun = (move: LessonMove, learner: boolean) => !learner || move.book === true;

/**
 * Every guide line end a clean run from `start` can reach, each once, in
 * walk order: the positions reached by a guide move where the guide has no
 * moves. A line that comes back to a position adds nothing.
 */
export function cleanLineEnds(lesson: Lesson, start: PositionKey): PositionKey[] {
  const ends: PositionKey[] = [];
  walkClean(lesson, start, (key) => {
    ends.push(key);
    return true;
  });
  return ends;
}

/**
 * Walks the clean runs from `start`, each position once, handing each line
 * end to `end`; stops as soon as `end` answers false. Says whether it went
 * all the way.
 */
export function walkClean(
  lesson: Lesson,
  start: PositionKey,
  end: (key: PositionKey) => boolean,
): boolean {
  const visited = new Set<PositionKey>();
  const toVisit: WalkStep[] = [[start, undefined]];
  for (let step = toVisit.pop(); step !== undefined; step = toVisit.pop()) {
    const [key, pos] = step;
    if (visited.has(key)) continue;
    visited.add(key);
    // Reached by a guide move, a position the guide has no moves at ends a line.
    if (guidePosition(lesson, key).place === 'inside') toVisit.push(...cleanNext(lesson, key, pos));
    else if (!end(key)) return false;
  }
  return true;
}

/** A position's key, with the position itself while a walk has it at hand. */
type WalkStep = readonly [PositionKey, Chess | undefined];

/** Each lesson's `cleanNext` answers: a lesson never changes, and replaying moves is slow. */
const nextKeys = new WeakMap<Lesson, Map<PositionKey, readonly PositionKey[]>>();

/**
 * The positions the guide's moves at `key` lead to, leaving out the learner's
 * non-book moves. The position `pos`, when the walk has it, saves reading the
 * key, which costs more than playing the moves. A step carries its position
 * only when its move was just played; one from the cache carries none.
 */
function cleanNext(lesson: Lesson, key: PositionKey, pos: Chess | undefined): readonly WalkStep[] {
  let byKey = nextKeys.get(lesson);
  if (!byKey) nextKeys.set(lesson, (byKey = new Map()));
  const known = byKey.get(key);
  if (known) return known.map((next) => [next, undefined]);
  // A shipped lesson's keys and moves are checked (check.ts), so this skips
  // playMove's checks and move names.
  const from = pos ?? readPositionKey(key)!;
  const learner = from.turn === lesson.side;
  const steps = lesson.positions[key].moves
    .filter((move) => inCleanRun(move, learner))
    .map(({ uci }): WalkStep => {
      const after = from.clone();
      after.play(parseUci(uci)!);
      return [positionKey(after), after];
    });
  byKey.set(
    key,
    steps.map(([next]) => next),
  );
  return steps;
}
