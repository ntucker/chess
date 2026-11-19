/**
 * The progress marks on the candidate list's rows (tech plan section 6). A
 * row is seen once Explore has shown the position its move leads to. It is
 * passed once clean Practice runs have reached every guide line end they can
 * reach through it. A clean run plays only the learner's book moves, so the
 * line ends below a learner's non-book move never count, and that move's own
 * row can't be passed.
 */
import { parsePositionKey, playMove, positionKey } from '@/game/replay';
import { type LessonProgress, type Mark, positionHash } from '@/progress/progress';

import type { Lesson, LessonMove, PositionKey, Uci } from './lesson';
import type { ModeState } from './practice';
import { guidePosition } from './select';
import type { LessonView } from './view';

/**
 * The mark the board's position earns now, if any: any guide position Explore
 * shows is seen, and a line's end that a clean Practice run reaches is passed.
 */
export function earnedMark(place: LessonView['place'], mode: ModeState): Mark | undefined {
  if (mode.mode === 'explore') return place === 'beyond' ? undefined : 'seen';
  return mode.clean && place === 'end' ? 'passed' : undefined;
}

/** Each candidate row's mark, by its move; a row with neither is absent. Passed outranks seen. */
export function rowMarks(
  lesson: Lesson,
  progress: LessonProgress,
  { candidates, learnerToMove }: Pick<LessonView, 'candidates' | 'learnerToMove'>,
): ReadonlyMap<Uci, Mark> {
  const seen = new Set(progress.seen);
  const passed = new Set(progress.passed);
  const marks = new Map<Uci, Mark>();
  for (const { move, next } of candidates) {
    if (inCleanRun(move, learnerToMove) && cleanEnds(lesson, passed, next) === 'passed') {
      marks.set(move.uci, 'passed');
    } else if (seen.has(positionHash(next))) marks.set(move.uci, 'seen');
  }
  return marks;
}

/** Any opponent's move can be part of a clean run; of the learner's, only book moves. */
const inCleanRun = (move: LessonMove, learner: boolean) => !learner || move.book === true;

/**
 * Where the clean runs from `start` stand, given the line ends `passed` (as
 * `positionHash`es): no line end reachable (`none`), all of them passed
 * (`passed`), or some still `open`. Walks each position once, so a line that
 * comes back to a position adds nothing, and stops at the first open end.
 * Each row walks on its own: sharing answers between rows went wrong on
 * cycles, and a fresh walk costs about 12 ms for the whole list at worst.
 */
function cleanEnds(
  lesson: Lesson,
  passed: ReadonlySet<string>,
  start: PositionKey,
): 'none' | 'open' | 'passed' {
  const visited = new Set<PositionKey>();
  const toVisit = [start];
  let status: 'none' | 'passed' = 'none';
  for (let key = toVisit.pop(); key !== undefined; key = toVisit.pop()) {
    if (visited.has(key)) continue;
    visited.add(key);
    // Reached by a guide move, a position the guide has no moves at ends a line.
    if (guidePosition(lesson, key).place === 'inside') toVisit.push(...cleanNext(lesson, key));
    else if (passed.has(positionHash(key))) status = 'passed';
    else return 'open';
  }
  return status;
}

/** Each lesson's `cleanNext` answers: a lesson never changes, and replaying moves is slow. */
const nextKeys = new WeakMap<Lesson, Map<PositionKey, readonly PositionKey[]>>();

/** The positions the guide's moves at `key` lead to, leaving out the learner's non-book moves. */
function cleanNext(lesson: Lesson, key: PositionKey): readonly PositionKey[] {
  let byKey = nextKeys.get(lesson);
  if (!byKey) nextKeys.set(lesson, (byKey = new Map()));
  let next = byKey.get(key);
  if (!next) {
    const pos = parsePositionKey(key)!;
    const learner = pos.turn === lesson.side;
    next = lesson.positions[key].moves
      .filter((move) => inCleanRun(move, learner))
      .map(({ uci }) => {
        const after = pos.clone();
        playMove(after, uci);
        return positionKey(after);
      });
    byKey.set(key, next);
  }
  return next;
}
