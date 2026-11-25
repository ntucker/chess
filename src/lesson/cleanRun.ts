/**
 * The moves a clean Practice run can play: only the learner's book moves,
 * and of the opponent's, those played often enough to count toward passing
 * (`COUNTED_SHARE`). Both the candidate rows' passed marks (`marks.ts`) and
 * the lesson index's line ends (`openings.ts`) walk the guide by this one
 * rule, so the two always agree.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { positionKey, readPositionKey } from '@/game/replay';

import type { Lesson, LessonMove, LessonPosition, PositionKey } from './lesson';
import { type GuidePosition, guidePosition } from './select';
import { moveGames, moveShare, positionGames } from './share';

/** Any opponent's move can be part of a clean run; of the learner's, only book moves. */
export const inCleanRun = (move: LessonMove, learner: boolean) => !learner || move.book === true;

/**
 * An opponent's reply counts toward passing when lichess players chose it at
 * least this share of the time, over all rating bands. The most played reply
 * always counts, and so does one without counts, which can't be told rare,
 * unless it is a marked mistake (`LessonMove.mistake`): a trap the guide
 * shows needn't be passed until its counts say how often it is played. Not
 * `RARE_SHARE` (select.ts), which only decides which rows the list folds
 * away, by the opponent's band: a reply played 5-10% gets its own row but
 * needn't be passed, and a marked mistake gets no exemption here.
 */
const COUNTED_SHARE = 0.1;

/** Of the guide's moves at `entry`, those a clean run plays and counts. */
const countedMoves = (entry: LessonPosition, learner: boolean) =>
  learner
    ? entry.moves.filter((move) => inCleanRun(move, learner))
    : countedReplies(entry.moves, positionGames(entry, 'all'));

/**
 * Of the opponent's replies at a position, those that count toward passing
 * (`COUNTED_SHARE`, over every band); `total` is the games that reached it,
 * where measured (`LessonPosition.games`).
 */
export function countedReplies(
  moves: readonly LessonMove[],
  total?: number,
): readonly LessonMove[] {
  const played = moves.map((move) => moveGames(move, 'all'));
  const listed = played.reduce<number>((sum, n) => sum + (n ?? 0), 0);
  const most = Math.max(...played.map((n) => n ?? 0));
  return moves.filter((move, i) => {
    if (played[i] === undefined) return !move.mistake;
    const share = moveShare(played[i], listed, total);
    return share === undefined || played[i] === most || share >= COUNTED_SHARE;
  });
}

/**
 * Whether the guide's line goes on from `key`: the guide has moves there,
 * and not only marked mistakes a clean run skips (the learner's, or the
 * opponent's without counts). Where only those are left, the line ends and
 * a trap starts.
 */
function lineGoesOn(lesson: Lesson, key: PositionKey): boolean {
  const guide = guidePosition(lesson, key);
  if (guide.place !== 'inside') return false;
  const { moves } = guide.entry;
  if (!moves.every(({ mistake }) => mistake)) return true;
  return countedMoves(guide.entry, readPositionKey(key)!.turn === lesson.side).length > 0;
}

/**
 * Whether a learner position with `moves` needs a book move: the guide has
 * moves there and books none. A marked mistake never stands in for one, so a
 * position whose moves are all marked still needs a move to play instead.
 */
export const needsBookMove = (moves: readonly LessonMove[]) =>
  moves.length > 0 && !moves.some(({ book }) => book);

/**
 * Where the position `arrivedBy` leads to stands on a guide line: inside it
 * while the line goes on (`lineGoesOn`), at its end where a guide move led
 * and the line stops, else beyond the guide. The shipped files keep no entry
 * for a line's last position, so `end` comes mostly from a guide move into a
 * position the file doesn't hold.
 */
export function linePlace(
  lesson: Lesson,
  key: PositionKey,
  arrivedBy: LessonMove | undefined,
): GuidePosition['place'] {
  if (lineGoesOn(lesson, key)) return 'inside';
  return arrivedBy || key in lesson.positions ? 'end' : 'beyond';
}

/**
 * Every guide line end a clean run from `start` can reach, each once, in
 * walk order: the positions reached by a guide move where the line stops
 * (`lineGoesOn`). A line that comes back to a position adds nothing.
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
    // Reached by a guide move, a position where the line stops ends it.
    if (lineGoesOn(lesson, key)) toVisit.push(...cleanNext(lesson, key, pos));
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
 * non-book moves and the opponent's rare ones (`countedReplies`). The position
 * `pos`, when the walk has it, saves reading the key, which costs more than
 * playing the moves. A step carries its position only when its move was just
 * played; one from the cache carries none.
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
  const steps = countedMoves(lesson.positions[key], learner).map(({ uci }): WalkStep => {
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
