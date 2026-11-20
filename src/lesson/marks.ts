/**
 * The progress marks on the candidate list's rows (tech plan section 6). A
 * row is seen once Explore has shown the position its move leads to. It is
 * passed once clean Practice runs have reached every guide line end they can
 * reach through it. A clean run plays only the learner's book moves, so the
 * line ends below a learner's non-book move never count, and that move's own
 * row can't be passed. The same walk steers a clean Practice run's opponent
 * to the lines still to pass (`steering`).
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { parsePosition, positionKey } from '@/game/replay';
import { type Mark, type MarkedPositions, positionHash } from '@/progress/progress';

import type { Lesson, LessonMove, PositionKey, Uci } from './lesson';
import type { ReplyChoice } from './opponent';
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
  const same =
    lastPassed?.list.length === list.length &&
    list.every((hash, i) => lastPassed!.list[i] === hash);
  if (!same) lastPassed = { list, set: new Set(list) };
  return lastPassed!.set;
}

/** Any opponent's move can be part of a clean run; of the learner's, only book moves. */
const inCleanRun = (move: LessonMove, learner: boolean) => !learner || move.book === true;

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

/** `cleanEnds`, worked out. */
function walkCleanEnds(lesson: Lesson, passed: ReadonlySet<string>, start: PositionKey): Ends {
  const visited = new Set<PositionKey>();
  const toVisit: Step[] = [[start, undefined]];
  let status: 'none' | 'passed' = 'none';
  for (let step = toVisit.pop(); step !== undefined; step = toVisit.pop()) {
    const [key, pos] = step;
    if (visited.has(key)) continue;
    visited.add(key);
    // Reached by a guide move, a position the guide has no moves at ends a line.
    if (guidePosition(lesson, key).place === 'inside') toVisit.push(...cleanNext(lesson, key, pos));
    else if (passed.has(positionHash(key))) status = 'passed';
    else return 'open';
  }
  return status;
}

/** A position's key, with the position itself while a walk has it at hand. */
type Step = readonly [PositionKey, Chess | undefined];

/** Each lesson's `cleanNext` answers: a lesson never changes, and replaying moves is slow. */
const nextKeys = new WeakMap<Lesson, Map<PositionKey, readonly PositionKey[]>>();

/**
 * The positions the guide's moves at `key` lead to, leaving out the learner's
 * non-book moves. The position `pos`, when the walk has it, saves reading the
 * key, which costs more than playing the moves.
 */
function cleanNext(lesson: Lesson, key: PositionKey, pos: Chess | undefined): readonly Step[] {
  let byKey = nextKeys.get(lesson);
  if (!byKey) nextKeys.set(lesson, (byKey = new Map()));
  const known = byKey.get(key);
  if (known) return known.map((next) => [next, undefined]);
  // A shipped lesson's keys and moves are checked (check.ts), so this skips
  // playMove's checks and move names.
  const from = pos ?? parsePosition(`${key} 0 1`)!;
  const learner = from.turn === lesson.side;
  const steps = lesson.positions[key].moves
    .filter((move) => inCleanRun(move, learner))
    .map(({ uci }): Step => {
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
