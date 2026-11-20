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
import type { Color } from '@/game/replay';
import {
  type Mark,
  type MarkedPositions,
  positionHash,
  type SavedProgress,
  UNTOUCHED,
} from '@/progress/progress';

import { countedReplies, inCleanRun, walkClean } from './cleanRun';
import type { Lesson, PositionKey, Uci } from './lesson';
import { type LessonIndex, linesThrough } from './openings';
import type { ReplyChoice } from './opponent';
import type { ModeState } from './practice';
import type { Candidate } from './select';
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
  const { seen, passed } = markSets(progress, lesson);
  return marksBy(view, ({ move, next }) =>
    inCleanRun(move, view.learnerToMove) && cleanEnds(lesson, passed, next) === 'passed'
      ? 'passed'
      : seenMark(seen, next),
  );
}

/**
 * The marks of the rows listed before a lesson is picked (src/lesson/openings.ts),
 * by move, at `line`: each row's from the lines of the index it leads to and
 * their lessons' progress, whichever lesson is loaded. A row is passed once
 * every one of those lines is (every line end it lists is passed), and seen
 * once a lesson has shown where one of them picks it, since the moves before
 * earn no marks. Passed outranks seen, as in `rowMarks`, and the two agree
 * (src/lesson/marks.test.ts holds them to it).
 */
export function openingMarks(
  index: LessonIndex,
  side: Color,
  line: readonly Uci[],
  progress: SavedProgress,
  view: Pick<LessonView, 'candidates'>,
): ReadonlyMap<Uci, Mark> {
  const own = (id: string) => progress[id] ?? UNTOUCHED;
  return marksBy(view, ({ move: { uci } }) => {
    const lines = linesThrough(index, side, [...line, uci]);
    const passed = ({ id, line: { lineEnds } }: (typeof lines)[number]) => {
      const done = hashSet(own(id).passed);
      return lineEnds.length > 0 && lineEnds.every((hash) => done.has(hash));
    };
    if (lines.length > 0 && lines.every(passed)) return 'passed';
    const seen = ({ id, line: { picked } }: (typeof lines)[number]) =>
      hashSet(own(id).seen).has(picked);
    return lines.some(seen) ? 'seen' : undefined;
  });
}

/** Each row's mark, as `mark` works it out; a row it gives none is absent. */
function marksBy(
  { candidates }: Pick<LessonView, 'candidates'>,
  mark: (candidate: Candidate) => Mark | undefined,
): ReadonlyMap<Uci, Mark> {
  const marks = new Map<Uci, Mark>();
  for (const candidate of candidates) {
    const found = mark(candidate);
    if (found) marks.set(candidate.move.uci, found);
  }
  return marks;
}

const seenMark = (seen: ReadonlySet<string>, next: PositionKey) =>
  seen.has(positionHash(next)) ? 'seen' : undefined;

/**
 * How the opponent picks its reply during a clean Practice run (undefined
 * otherwise, so it plays its most played): the first of the replies that
 * count (most played first, `countedReplies`) below which the run can still
 * reach a line end not passed, or the first that counts when every one is
 * passed. The opponent's own replies never spoil a run, so each is open to
 * steer to.
 */
export function steering(
  lesson: Lesson,
  progress: MarkedPositions,
  mode: ModeState,
): ReplyChoice | undefined {
  if (mode.mode !== 'practice' || !mode.clean) return undefined;
  const { passed } = markSets(progress, lesson);
  return (replies) => {
    // A rare reply's lines don't count toward passing, so nothing steers there.
    const counted = new Set(countedReplies(replies.map(({ move }) => move)));
    return (
      replies.find(
        ({ move, next }) => counted.has(move) && cleanEnds(lesson, passed, next) === 'open',
      ) ??
      replies.find(({ move }) => counted.has(move)) ??
      replies[0]
    );
  };
}

/** A progress's marks as sets of `positionHash`es. */
type MarkSets = Readonly<Record<Mark, ReadonlySet<string>>>;

/**
 * `progress`'s marks as sets, since steering asks on every render: seen is
 * built once per list, and passed comes from `passedSet`, which reuses the
 * lesson's set while its passed list is unchanged.
 */
const markSets = (progress: MarkedPositions, lesson: Lesson): MarkSets => ({
  seen: hashSet(progress.seen),
  passed: passedSet(lesson, progress.passed),
});

/** A saved list of hashes as a set, built once per list: saved lists never change. */
function hashSet(list: readonly string[]): ReadonlySet<string> {
  let set = hashSets.get(list);
  if (!set) hashSets.set(list, (set = new Set(list)));
  return set;
}
const hashSets = new WeakMap<readonly string[], ReadonlySet<string>>();

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
  // The same array is the common case (the same progress, asked again).
  if (last && (last.list === list || sameHashes(last.list, list))) return last.set;
  const set = new Set(list);
  lastPassed.set(lesson, { list, set });
  return set;
}

const sameHashes = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((hash, i) => b[i] === hash);

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
