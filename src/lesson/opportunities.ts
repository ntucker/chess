/**
 * A lesson's list of opportunities (docs/plans/opportunities.md, piece G):
 * the marked mistakes of the side the learner plays against, ranked by what
 * knowing each is worth per game in the opponent's band. Derived from the
 * lesson file on demand; nothing stores the list.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { keyTurn, playMove, positionKey, readPositionKey } from '@/game/replay';
import { findScore, type Move, rankBy, reachOf } from '@/opportunity/finder';
import { type Node, walkTo } from '@/opportunity/walk';

import type { Lesson, LessonMove, LessonPosition, PositionKey, Uci } from './lesson';
import { guideOrder, type MarkedMove, markedMoves, mistakeLine } from './mistakes';
import { bandShare } from './share';

/** One of the other side's marked mistakes, with what its row shows. */
export interface Opportunity {
  /** The position the mistake is played in. */
  readonly key: PositionKey;
  /** The marked mistake: its name, cost and gains. */
  readonly move: LessonMove;
  readonly san: string;
  /** The cue: the position the mistake leads to. */
  readonly next: PositionKey;
  /**
   * Act I, then the mistake: the moves from the lesson's start, through the
   * board's position the list is from (`guideLines`).
   */
  readonly line: readonly Uci[];
  /**
   * The share of the band's games from the board's position that reach `key`
   * while the learner plays the guide's moves (`reachOf`; `guideLines` says
   * how positions the band doesn't count weigh). Absent without a band.
   */
  readonly reach?: number;
  /** The mistake's share of the band's games at `key`, where counted. */
  readonly share?: number;
  /** The punishment ends in mate. */
  readonly mates: boolean;
  /** What knowing the punishment is worth per game at the cue in the band (`Mistake.gain`), where measured. */
  readonly gain?: number;
  /**
   * `reach` × `share` × `gain` (`findScore`): what knowing it is worth per
   * game. Absent where the gain isn't measured yet (a trap migrated from a
   * guide) or the band has no counts for the mistake.
   */
  readonly score?: number;
}

/**
 * The other side's marked mistakes in `lesson`, each with the position it is
 * played in, in the file's order. Read once per lesson, since a big lesson
 * has many positions and the screen asks on every render.
 */
function markedMistakes(lesson: Lesson): readonly MarkedMove[] {
  let found = marked.get(lesson);
  if (!found) {
    found = markedMoves(lesson).filter(({ key }) => keyTurn(key) !== lesson.side);
    marked.set(lesson, found);
  }
  return found;
}
const marked = new WeakMap<Lesson, readonly MarkedMove[]>();

/**
 * The cues of the opportunities `lesson` lists from its start
 * (`lessonOpportunities`): its marked mistakes the guide leads to, wherever
 * the board is now. Read once per lesson; no band is needed, since which
 * mistakes the guide leads to doesn't depend on one.
 */
export function guideCues(lesson: Lesson): ReadonlySet<PositionKey> {
  let found = cues.get(lesson);
  if (!found) {
    found = new Set(lessonOpportunities(lesson, undefined, []).map(({ next }) => next));
    cues.set(lesson, found);
  }
  return found;
}
const cues = new WeakMap<Lesson, ReadonlySet<PositionKey>>();

/**
 * How many times the walk's depth a move order through the moves it went may
 * take and still count: a longer detour is rare, and counting further costs
 * a pass per ply where a circle goes round (twice costs what the fewest-move
 * reach did, measured on the Caro-Kann).
 */
const DETOUR = 2;

/** Where the guide's walk starts: the board's position and its key. */
type WalkStart = Pick<Node, 'key' | 'pos'>;

/** How many positions' lists and walks each lesson keeps: the board's and the few it steps between. */
const KEPT = 16;

/**
 * `kept`'s value for `key`, made once and kept among the `KEPT` most recently
 * asked for, so the positions the board steps back and forth between stay.
 */
function remember<T>(kept: Map<string, T>, key: string, make: () => T): T {
  let value = kept.get(key);
  // Asked for again: moved to the newest end, which a Map keeps in order of setting.
  if (value !== undefined) kept.delete(key);
  else value = make();
  kept.set(key, value);
  if (kept.size > KEPT) kept.delete(kept.keys().next().value!);
  return value;
}

/**
 * The opportunities of `lesson` in `band` (an index into its rating bands,
 * none where it has no counts) still ahead of the board after `line`, the
 * moves from the lesson's start: the scored ones best first, then the
 * unscored; ties go by reach, then by the line, as the finder ranks its finds
 * (`rankBy`). Only mistakes the guide's moves reach from the board's position
 * are listed, as the finder keeps only those on the guide for a lesson, so
 * reach rises as the line nears a mistake and one the line has passed drops
 * out. Worked out once per lesson, band and position.
 */
export function lessonOpportunities(
  lesson: Lesson,
  band: number | undefined,
  line: readonly Uci[],
): readonly Opportunity[] {
  let byLine = listed.get(lesson);
  if (!byLine) listed.set(lesson, (byLine = new Map()));
  return remember(byLine, `${band} ${line.join(' ')}`, () => {
    // The board's moves are the game's, so they play.
    const from = walkTo(lesson.start, line)!;
    const ahead = rankOpportunities(lesson, band, from);
    return ahead.map((row) => ({ ...row, line: [...line, ...row.line] }));
  });
}
/** Each lesson's lists, by band and the board's line. */
const listed = new WeakMap<Lesson, Map<string, readonly Opportunity[]>>();

/** `lessonOpportunities` from `from`, worked out, with lines from there. */
function rankOpportunities(
  lesson: Lesson,
  band: number | undefined,
  from: WalkStart,
): Opportunity[] {
  const mistakes = markedMistakes(lesson);
  if (!mistakes.length) return [];
  const walk = guideLines(lesson, band, new Set(mistakes.map(({ key }) => key)), from);
  const reachAt = reachOf(walk.start, walk.moves, walk.plies);
  // Every move the walk takes is on the guide, so reach counts those alone.
  // Without a band there are no counts to reach by.
  const onGuide = (key: PositionKey) => (band === undefined ? undefined : reachAt(key, true));
  const found = mistakes.flatMap(({ key, move }): Opportunity[] => {
    const into = walk.lines.get(key);
    if (!into) return [];
    const after = readPositionKey(key)!;
    const { san } = playMove(after, move.uci)!; // which plays it on `after`
    const next = positionKey(after);
    const share = bandShare(lesson.positions[key], band)(move);
    const gain = band === undefined ? undefined : move.mistake?.gain?.[band];
    const reach = onGuide(key);
    return [
      {
        key,
        move,
        san,
        next,
        line: [...into, move.uci],
        reach,
        share,
        mates: mates(lesson, key, move),
        gain,
        score:
          gain === undefined || share === undefined || reach === undefined
            ? undefined
            : findScore(reach, share, gain),
      },
    ];
  });
  return found.sort(byRank);
}

/** Best first, as the finder ranks (`rankBy`); the line runs through the mistake. */
const byRank = rankBy<Opportunity>(({ line }) => line);

/** A move of the guide's walk (`guideLevels`): from one position to the next. */
interface GuideStep {
  readonly from: PositionKey;
  readonly to: PositionKey;
  readonly move: LessonMove;
  /** The learner's move, by the guide's choice rule (`guideOrder`). */
  readonly learner: boolean;
}

/**
 * The guide's moves from `start`, level by level (each level the moves one
 * ply deeper): the moves the finder counts as on the guide, the learner's by
 * its choice rule (`guideOrder`) and every one of the opponent's. Each
 * position is walked on from once, at the depth it is first reached.
 */
function* guideLevels(lesson: Lesson, start: WalkStart): Generator<readonly GuideStep[]> {
  const seen = new Set([start.key]);
  let level: (readonly [PositionKey, Chess])[] = [[start.key, start.pos]];
  while (level.length) {
    const steps: GuideStep[] = [];
    const next: (readonly [PositionKey, Chess])[] = [];
    for (const [from, pos] of level) {
      const entry = lesson.positions[from];
      if (!entry) continue;
      const learner = pos.turn === lesson.side;
      for (const move of learner ? guideOrder(lesson, from, lesson.side) : entry.moves) {
        // A shipped lesson's moves are checked (check.ts), so this skips playMove's checks and move names.
        const after = pos.clone();
        after.play(parseUci(move.uci)!);
        const to = positionKey(after);
        steps.push({ from, to, move, learner });
        if (!seen.has(to)) {
          seen.add(to);
          next.push([to, after]);
        }
      }
    }
    yield steps;
    level = next;
  }
}

/**
 * The guide's levels of `lesson` from `start` (`guideLevels`), walked once per
 * lesson and position and only as deep as a reader asks, so the list in each
 * band shares one walk.
 */
function* sharedLevels(lesson: Lesson, start: WalkStart): Generator<readonly GuideStep[]> {
  let byStart = walks.get(lesson);
  if (!byStart) walks.set(lesson, (byStart = new Map()));
  const walk = remember(byStart, start.key, () => ({
    levels: [],
    rest: guideLevels(lesson, start),
  }));
  for (let depth = 0; ; depth++) {
    if (depth === walk.levels.length) {
      const next = walk.rest.next();
      if (next.done) return;
      walk.levels.push(next.value);
    }
    yield walk.levels[depth];
  }
}
/** A lesson's guide levels walked so far, and the walk that goes on from there. */
interface GuideWalk {
  readonly levels: (readonly GuideStep[])[];
  readonly rest: Generator<readonly GuideStep[]>;
}
const walks = new WeakMap<Lesson, Map<PositionKey, GuideWalk>>();

/**
 * The guide's levels down to one past the deepest of `wanted` (so the moves
 * played there, the mistakes into their cues, count toward reach), or all of
 * them.
 */
function levelsTo(
  lesson: Lesson,
  wanted: ReadonlySet<PositionKey>,
  start: WalkStart,
): readonly (readonly GuideStep[])[] {
  const levels: (readonly GuideStep[])[] = [];
  const left = new Set(wanted);
  left.delete(start.key);
  for (const level of sharedLevels(lesson, start)) {
    levels.push(level);
    if (!left.size) break;
    for (const { to } of level) left.delete(to);
  }
  return levels;
}

/**
 * The guide's levels (`levelsTo`) weighed in `band`: the moves `reachOf`
 * reads, each with the opponent's share, and the line into each of `wanted`:
 * of the lines with fewest moves, the one games play most often. Where the
 * band has no counts at a position (often deep in a line, past what the
 * explorer was asked), its guide moves take its games equally, so reach is
 * of the games that come that far.
 */
function guideLines(
  lesson: Lesson,
  band: number | undefined,
  wanted: ReadonlySet<PositionKey>,
  walkStart: WalkStart,
) {
  const start = walkStart.key;
  // Each position reached: how deep, how likely its likeliest fewest-move line, and that line's last step.
  const reached = new Map<
    PositionKey,
    { depth: number; odds: number; from?: PositionKey; uci?: Uci }
  >([[start, { depth: 0, odds: 1 }]]);
  const moves: Move[] = [];
  const shares = new Map<PositionKey, (move: LessonMove) => number>();
  const shareAt = (key: PositionKey) => {
    let share = shares.get(key);
    if (!share) shares.set(key, (share = walkShare(lesson.positions[key], band)));
    return share;
  };
  const levels = levelsTo(lesson, wanted, walkStart);
  levels.forEach((level, i) => {
    const depth = i + 1;
    for (const { from, to, move, learner } of level) {
      const share = learner ? 1 : shareAt(from)(move);
      moves.push({ from, to, share, guided: true, chosen: learner });
      const odds = reached.get(from)!.odds * share;
      const known = reached.get(to);
      if (!known || (known.depth === depth && odds > known.odds)) {
        reached.set(to, { depth, odds, from, uci: move.uci });
      }
    }
  });
  return { start, moves, plies: DETOUR * levels.length, lines: linesInto(reached, wanted) };
}

/**
 * Each of `entry`'s moves' share of its games in `band` for the walk: as
 * counted (none for a move without counts), or, where the band counts no
 * move here, an equal part each.
 */
function walkShare(entry: LessonPosition, band: number | undefined) {
  const share = bandShare(entry, band);
  const counted = entry.moves.some((move) => share(move) !== undefined);
  return (move: LessonMove) => (counted ? (share(move) ?? 0) : 1 / entry.moves.length);
}

/** The line into each of `wanted` the walk reached, back along each position's last step. */
function linesInto(
  reached: ReadonlyMap<PositionKey, { readonly from?: PositionKey; readonly uci?: Uci }>,
  wanted: ReadonlySet<PositionKey>,
): Map<PositionKey, Uci[]> {
  const lineTo = (key: PositionKey): Uci[] => {
    const { from, uci } = reached.get(key)!;
    return from === undefined ? [] : [...lineTo(from), uci!];
  };
  return new Map([...wanted].filter((key) => reached.has(key)).map((key) => [key, lineTo(key)]));
}

/** Whether the punishment ends in checkmate: the line from `key` through `move`, a marked mistake there. */
function mates(lesson: Lesson, key: PositionKey, move: LessonMove): boolean {
  const pos = readPositionKey(key)!;
  // Checked lines (check.ts), so this skips playMove's checks and move names, as `guideLevels` does.
  for (const uci of mistakeLine(lesson, key, move)) pos.play(parseUci(uci)!);
  return pos.isCheckmate();
}
