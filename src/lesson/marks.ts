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
import { type LessonIndex, lessonOf, START_KEY } from './openings';
import type { ReplyChoice } from './opponent';
import type { ModeState } from './practice';
import { type Candidate, guideMove, guidePosition } from './select';
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
  const sets = markSets(progress, lesson);
  return marksBy(view, ({ move }) => ({ lesson, sets, move }));
}

/**
 * The start position's rows' marks (src/lesson/openings.ts), by move: each
 * row's from its own opening's lesson and `progress`, whichever lesson is
 * loaded. A row's lesson missing from `lessons` can't be walked, so the row
 * is at most seen; only a lesson with a passed line end can pass its row
 * (`lessonsPassing`). Whether a row is a book move is its lesson's to say:
 * the start's own list carries no book flags.
 */
export function openingMarks(
  index: LessonIndex,
  progress: SavedProgress,
  lessons: Readonly<Partial<Record<string, Lesson>>>,
  view: Pick<LessonView, 'candidates' | 'learnerToMove'>,
): ReadonlyMap<Uci, Mark> {
  return marksBy(view, ({ move }) => {
    const id = lessonOf(index, [move.uci]);
    if (id === undefined) return undefined;
    const lesson = lessons[id];
    const own = lesson && guideMove(lesson, START_KEY, move.uci);
    return { lesson, sets: markSets(progress[id] ?? UNTOUCHED, lesson), move: own ?? move };
  });
}

/** The lessons with a passed line end in `progress`: the only ones whose start row can pass. */
export const lessonsPassing = <Id extends string>(
  index: LessonIndex<Id>,
  progress: SavedProgress,
) => (Object.keys(index) as Id[]).filter((id) => progress[id]?.passed.length);

/** Each row's mark, from what `source` gives for it (`RowSource`); a row it skips has none. */
function marksBy(
  { candidates, learnerToMove }: Pick<LessonView, 'candidates' | 'learnerToMove'>,
  source: (candidate: Candidate) => RowSource | undefined,
): ReadonlyMap<Uci, Mark> {
  const marks = new Map<Uci, Mark>();
  for (const candidate of candidates) {
    const found = source(candidate);
    const mark = found && rowMark(found, candidate.next, learnerToMove);
    if (mark) marks.set(candidate.move.uci, mark);
  }
  return marks;
}

/** What a row's mark is worked out from. */
interface RowSource {
  /** The row's lesson, to walk for passed; absent while it isn't loaded. */
  readonly lesson: Lesson | undefined;
  readonly sets: MarkSets;
  /** The row's move as its lesson has it, book flag and all. */
  readonly move: LessonMove;
}

/** One row's mark, walking its lesson for passed only when it is at hand. */
function rowMark(
  { lesson, sets: { seen, passed }, move }: RowSource,
  next: PositionKey,
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
  const { passed } = markSets(progress, lesson);
  return (replies) =>
    replies.find(({ next }) => cleanEnds(lesson, passed, next) === 'open') ?? replies[0];
}

/** A progress's marks as sets of `positionHash`es. */
type MarkSets = Readonly<Record<Mark, ReadonlySet<string>>>;

/**
 * Each progress's marks as sets, made once: steering asks on every render.
 * The passed set is `lesson`'s (`passedSet`) when the lesson is at hand.
 */
const sets = new WeakMap<MarkedPositions, MarkSets>();
function markSets(progress: MarkedPositions, lesson: Lesson | undefined): MarkSets {
  let found = sets.get(progress);
  if (!found) {
    const passed = lesson ? passedSet(lesson, progress.passed) : new Set(progress.passed);
    found = { seen: new Set(progress.seen), passed };
    sets.set(progress, found);
  }
  return found;
}

/**
 * `lesson`'s passed marks as a set, the same set as last time while they are
 * the same: a seen mark makes a new progress, and `cleanEnds` keeps its
 * answers per set. One per lesson, so reading one lesson's progress keeps
 * another's.
 */
const lastPassed = new WeakMap<
  Lesson,
  { readonly list: readonly string[]; readonly set: ReadonlySet<string> }
>();
function passedSet(lesson: Lesson, list: readonly string[]) {
  const last = lastPassed.get(lesson);
  if (last?.list.length === list.length && list.every((hash, i) => last.list[i] === hash)) {
    return last.set;
  }
  const set = new Set(list);
  lastPassed.set(lesson, { list, set });
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
