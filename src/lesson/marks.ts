/**
 * The progress marks on the candidate list's rows (tech plan section 6). A
 * row is seen once Explore has shown the position its move leads to. It is
 * passed once clean Practice runs have reached every guide line end that
 * counts through it (`cleanRun.ts`): a clean run plays only the learner's
 * book moves, so the line ends below a learner's non-book move never count,
 * and that move's own row can't be passed; nor do the ends below an
 * opponent's rare reply. The same walk steers a clean Practice run's
 * opponent to the lines still to pass (`steering`).
 */
import { type Mark, type MarkedPositions, positionHash } from '@/progress/progress';

import { inCleanRun, walkClean } from './cleanRun';
import type { Lesson, PositionKey, Uci } from './lesson';
import type { ReplyChoice } from './opponent';
import type { ModeState } from './practice';
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
  progress: MarkedPositions,
  { candidates, learnerToMove }: Pick<LessonView, 'candidates' | 'learnerToMove'>,
): ReadonlyMap<Uci, Mark> {
  const { seen, passed } = markSets(progress);
  const marks = new Map<Uci, Mark>();
  for (const { move, next } of candidates) {
    if (inCleanRun(move, learnerToMove) && cleanEnds(lesson, passed, next) === 'passed') {
      marks.set(move.uci, 'passed');
    } else if (seen.has(positionHash(next))) marks.set(move.uci, 'seen');
  }
  return marks;
}

/**
 * How the opponent picks its reply during a clean Practice run (undefined
 * otherwise, so it plays its most played): the first of the replies (most
 * played first) below which the run can still reach a line end not passed,
 * or the first when every one is passed. The opponent's own replies never
 * spoil a run, so each is open to steer to.
 */
export function steering(
  lesson: Lesson,
  progress: MarkedPositions,
  mode: ModeState,
): ReplyChoice | undefined {
  if (mode.mode !== 'practice' || !mode.clean) return undefined;
  const { passed } = markSets(progress);
  return (replies) =>
    replies.find(({ next }) => cleanEnds(lesson, passed, next) === 'open') ?? replies[0];
}

/** Each progress's marks as sets, made once: steering asks on every render. */
const sets = new WeakMap<MarkedPositions, Readonly<Record<Mark, ReadonlySet<string>>>>();
function markSets(progress: MarkedPositions) {
  let found = sets.get(progress);
  if (!found) {
    found = { seen: new Set(progress.seen), passed: passedSet(progress.passed) };
    sets.set(progress, found);
  }
  return found;
}

/**
 * The passed marks as a set, the same set as last time while they are the
 * same: a seen mark makes a new progress, and `cleanEnds` keeps its answers
 * per set.
 */
let lastPassed: { readonly list: readonly string[]; readonly set: ReadonlySet<string> } | undefined;
function passedSet(list: readonly string[]) {
  const last = lastPassed;
  if (last?.list.length === list.length && list.every((hash, i) => last.list[i] === hash)) {
    return last.set;
  }
  const set = new Set(list);
  lastPassed = { list, set };
  return set;
}

/**
 * Where the clean runs from `start` stand, given the line ends `passed` (as
 * `positionHash`es): no line end reachable (`none`), all of them passed
 * (`passed`), or some still `open`. Walks each position once, so a line that
 * comes back to a position adds nothing, and stops at the first open end.
 * Each row walks on its own: answers shared between rows go wrong on cycles.
 */
function cleanEnds(lesson: Lesson, passed: ReadonlySet<string>, start: PositionKey): Ends {
  let byPassed = endsFound.get(lesson);
  if (!byPassed) endsFound.set(lesson, (byPassed = new WeakMap()));
  let byStart = byPassed.get(passed);
  if (!byStart) byPassed.set(passed, (byStart = new Map()));
  let ends = byStart.get(start);
  if (!ends) byStart.set(start, (ends = walkCleanEnds(lesson, passed, start)));
  return ends;
}

type Ends = 'none' | 'open' | 'passed';

/** `cleanEnds` answers, by lesson and by the passed marks they were worked out with. */
const endsFound = new WeakMap<Lesson, WeakMap<ReadonlySet<string>, Map<PositionKey, Ends>>>();

/** `cleanEnds`, worked out: the walk stops at the first open end. */
function walkCleanEnds(lesson: Lesson, passed: ReadonlySet<string>, start: PositionKey): Ends {
  let any = false;
  const allPassed = walkClean(lesson, start, (key) => {
    any = true;
    return passed.has(positionHash(key));
  });
  if (!allPassed) return 'open';
  return any ? 'passed' : 'none';
}
