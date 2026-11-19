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
  const ends = endsBelow(lesson, new Set(progress.passed));
  const marks = new Map<Uci, Mark>();
  for (const { move, next } of candidates) {
    if (inCleanRun(move, learnerToMove) && ends(next) === 'passed') marks.set(move.uci, 'passed');
    else if (seen.has(positionHash(next))) marks.set(move.uci, 'seen');
  }
  return marks;
}

/** Any opponent's move can be part of a clean run; of the learner's, only book moves. */
const inCleanRun = (move: LessonMove, learner: boolean) => !learner || move.book === true;

/**
 * The line ends a clean run can reach from a position: `none`, all of them
 * `passed`, or some still `open`.
 */
type EndsStatus = 'none' | 'open' | 'passed';

/**
 * Where the clean runs from a guide move's position stand, given the line
 * ends `passed` (as `positionHash`es). Remembers each position it answers
 * for, since lines that transpose share what follows.
 */
function endsBelow(lesson: Lesson, passed: ReadonlySet<string>) {
  const known = new Map<PositionKey, EndsStatus>();
  // The positions on the walk now, by how deep in it each is.
  const walking = new Map<PositionKey, number>();
  /** The status of `key`, and the depth of the shallowest position on the walk it came back to. */
  const walk = (key: PositionKey, depth: number): [EndsStatus, number] => {
    // Reached by a guide move, a position the guide has no moves at ends a line.
    if (guidePosition(lesson, key).place !== 'inside') {
      return [passed.has(positionHash(key)) ? 'passed' : 'open', Infinity];
    }
    const answer = known.get(key);
    if (answer) return [answer, Infinity];
    // A line that comes back to a position adds no end of its own.
    const at = walking.get(key);
    if (at !== undefined) return ['none', at];
    walking.set(key, depth);
    let status: EndsStatus = 'none';
    let back = Infinity;
    for (const next of cleanNext(lesson, key)) {
      const [ends, reached] = walk(next, depth + 1);
      back = Math.min(back, reached);
      if (ends === 'open') {
        status = 'open';
        break;
      }
      if (ends === 'passed') status = 'passed';
    }
    walking.delete(key);
    // A walk that came back to a position above this one hasn't counted that
    // position's other lines yet, so only an open line is sure here.
    if (status === 'open' || back >= depth) known.set(key, status);
    return [status, back];
  };
  return (key: PositionKey) => walk(key, 0)[0];
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
