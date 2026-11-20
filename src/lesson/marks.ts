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

import { positionKey, readPositionKey } from '@/game/replay';
import {
  type Mark,
  type MarkedPositions,
  positionHash,
  type SavedProgress,
  UNTOUCHED,
} from '@/progress/progress';

import type { Lesson, LessonMove, PositionKey, Uci } from './lesson';
import { type LessonIndex, lessonOf } from './openings';
import type { ReplyChoice } from './opponent';
import type { ModeState } from './practice';
import { type Candidate, guidePosition } from './select';
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
  view: Pick<LessonView, 'candidates' | 'learnerToMove'>,
): ReadonlyMap<Uci, Mark> {
  const sets = markSets(progress);
  return marksBy(view, () => [lesson, sets]);
}

/**
 * The start position's rows' marks (src/lesson/openings.ts), by move: each
 * row's from its own opening's lesson and `progress`, whichever lesson is
 * loaded. A row's lesson missing from `lessons` can't be walked, so the row
 * is at most seen; only a lesson with a passed line end can pass its row
 * (`lessonsPassing`).
 */
export function openingMarks(
  index: LessonIndex,
  progress: SavedProgress,
  lessons: Readonly<Partial<Record<string, Lesson>>>,
  view: Pick<LessonView, 'candidates' | 'learnerToMove'>,
): ReadonlyMap<Uci, Mark> {
  return marksBy(view, ({ move }) => {
    const id = lessonOf(index, [move.uci]);
    return id === undefined ? undefined : [lessons[id], markSets(progress[id] ?? UNTOUCHED)];
  });
}

/** The lessons with a passed line end in `progress`: the only ones whose start row can pass. */
export const lessonsPassing = <Id extends string>(
  index: LessonIndex<Id>,
  progress: SavedProgress,
) => (Object.keys(index) as Id[]).filter((id) => progress[id]?.passed.length);

/** Each row's mark, from the lesson (when at hand) and marks `source` gives for it. */
function marksBy(
  { candidates, learnerToMove }: Pick<LessonView, 'candidates' | 'learnerToMove'>,
  source: (candidate: Candidate) => readonly [Lesson | undefined, MarkSets] | undefined,
): ReadonlyMap<Uci, Mark> {
  const marks = new Map<Uci, Mark>();
  for (const candidate of candidates) {
    const found = source(candidate);
    const mark = found && rowMark(...found, candidate, learnerToMove);
    if (mark) marks.set(candidate.move.uci, mark);
  }
  return marks;
}

/** One row's mark, walking `lesson` for passed only when it is at hand. */
function rowMark(
  lesson: Lesson | undefined,
  { seen, passed }: MarkSets,
  { move, next }: Candidate,
  learnerToMove: boolean,
): Mark | undefined {
  if (lesson && inCleanRun(move, learnerToMove) && cleanEnds(lesson, passed, next) === 'passed') {
    return 'passed';
  }
  return seen.has(positionHash(next)) ? 'seen' : undefined;
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

/** A progress's marks as sets of `positionHash`es. */
type MarkSets = Readonly<Record<Mark, ReadonlySet<string>>>;

/** Each progress's marks as sets, made once: steering asks on every render. */
const sets = new WeakMap<MarkedPositions, MarkSets>();
function markSets(progress: MarkedPositions): MarkSets {
  let found = sets.get(progress);
  if (!found) {
    found = { seen: new Set(progress.seen), passed: passedSet(progress.passed) };
    sets.set(progress, found);
  }
  return found;
}

/**
 * The passed marks as a set, the same set as before while they are the
 * same: a seen mark makes a new progress, and `cleanEnds` keeps its answers
 * per set. It keeps the last few, one per lesson the start position's rows
 * read, so reading one lesson's progress keeps another's.
 */
const recentPassed: { readonly list: readonly string[]; readonly set: ReadonlySet<string> }[] = [];
const RECENT_PASSED = 4;
function passedSet(list: readonly string[]) {
  const same = recentPassed.find(
    (recent) =>
      recent.list.length === list.length && list.every((hash, i) => recent.list[i] === hash),
  );
  if (same) return same.set;
  const set = new Set(list);
  recentPassed.unshift({ list, set });
  recentPassed.length = Math.min(recentPassed.length, RECENT_PASSED);
  return set;
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
  const toVisit: WalkStep[] = [[start, undefined]];
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
