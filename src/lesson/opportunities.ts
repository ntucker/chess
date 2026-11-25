/**
 * A lesson's list of opportunities (docs/plans/opportunities.md, piece G):
 * the marked mistakes of the side the learner plays against, ranked by what
 * knowing each is worth per game in the opponent's band. Derived from the
 * lesson file on demand; nothing stores the list.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { keyTurn, parsePosition, playMove, positionKey, readPositionKey } from '@/game/replay';
import { findScore, type Move, rankBy, reachOf } from '@/opportunity/finder';

import type { Lesson, LessonMove, LessonPosition, PositionKey, Uci } from './lesson';
import { guideOrder, mistakeLine } from './mistakes';
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
  /** Act I, then the mistake: the moves from the lesson's start (`guideLines`). */
  readonly line: readonly Uci[];
  /**
   * The share of the band's games from the lesson's start that reach `key`
   * while the learner plays the guide's moves (`reachOf`; `guideLines` says
   * how positions the band doesn't count weigh). Absent without a band.
   */
  readonly reach?: number;
  /** The mistake's share of the band's games at `key`, where counted. */
  readonly share?: number;
  /** The punishment ends in mate. */
  readonly mates: boolean;
  /**
   * The share of games that reach the cue × the mistake's gain in the band
   * (`findScore`): what knowing it is worth per game. Absent where the gain
   * isn't measured yet (a trap migrated from a guide) or the band has no
   * counts for the mistake.
   */
  readonly score?: number;
}

/**
 * The other side's marked mistakes in `lesson`, each with the position it is
 * played in, in the file's order. Read once per lesson, since a big lesson
 * has many positions and the screen asks on every render.
 */
function markedMistakes(lesson: Lesson): readonly MarkedMistake[] {
  let found = marked.get(lesson);
  if (!found) {
    found = Object.entries(lesson.positions).flatMap(([key, { moves }]) =>
      keyTurn(key) === lesson.side
        ? []
        : moves.filter((move) => move.mistake).map((move) => ({ key, move })),
    );
    marked.set(lesson, found);
  }
  return found;
}
const marked = new WeakMap<Lesson, readonly MarkedMistake[]>();
interface MarkedMistake {
  readonly key: PositionKey;
  readonly move: LessonMove;
}

/** The position `lesson` starts from, where every guide line begins. */
const startKey = (lesson: Lesson) => positionKey(parsePosition(lesson.start)!);

/**
 * The opportunities of `lesson` in `band` (an index into its rating bands,
 * none where it has no counts), the scored ones best first, then the
 * unscored; ties go by reach, then by the line, as the finder ranks its finds
 * (`rankBy`). Only mistakes the guide's moves reach from the start are
 * listed, as the finder keeps only those on the guide for a lesson. Worked
 * out once per lesson and band.
 */
export function lessonOpportunities(
  lesson: Lesson,
  band: number | undefined,
): readonly Opportunity[] {
  let byBand = listed.get(lesson);
  if (!byBand) listed.set(lesson, (byBand = new Map()));
  let list = byBand.get(band);
  if (!list) byBand.set(band, (list = rankOpportunities(lesson, band)));
  return list;
}
const listed = new WeakMap<Lesson, Map<number | undefined, readonly Opportunity[]>>();

/** `lessonOpportunities`, worked out. */
function rankOpportunities(lesson: Lesson, band: number | undefined): Opportunity[] {
  const mistakes = markedMistakes(lesson);
  if (!mistakes.length) return [];
  const walk = guideLines(lesson, band, new Set(mistakes.map(({ key }) => key)));
  const reachAt = reachOf(walk.start, walk.moves);
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
    const cueReach = onGuide(next);
    return [
      {
        key,
        move,
        san,
        next,
        line: [...into, move.uci],
        reach: onGuide(key),
        share,
        mates: mates(lesson, key, move),
        score:
          gain === undefined || share === undefined || cueReach === undefined
            ? undefined
            : findScore(cueReach, gain),
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
 * The guide's moves from the lesson's start, level by level (each level the
 * moves one ply deeper): the moves the finder counts as on the guide, the
 * learner's by its choice rule (`guideOrder`) and every one of the opponent's.
 * Each position is walked on from once, at the depth it is first reached.
 */
function* guideLevels(lesson: Lesson): Generator<readonly GuideStep[]> {
  const startPos = parsePosition(lesson.start)!;
  const seen = new Set([positionKey(startPos)]);
  let level: (readonly [PositionKey, Chess])[] = [[positionKey(startPos), startPos]];
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
 * The guide's levels of `lesson` (`guideLevels`), walked once per lesson and
 * only as deep as a reader asks, so the list in each band shares one walk.
 */
function* sharedLevels(lesson: Lesson): Generator<readonly GuideStep[]> {
  let walk = walks.get(lesson);
  if (!walk) walks.set(lesson, (walk = { levels: [], rest: guideLevels(lesson) }));
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
const walks = new WeakMap<Lesson, GuideWalk>();

/**
 * The guide's levels down to one past the deepest of `wanted` (so the moves
 * played there, the mistakes into their cues, count toward reach), or all of
 * them.
 */
function levelsTo(
  lesson: Lesson,
  wanted: ReadonlySet<PositionKey>,
): readonly (readonly GuideStep[])[] {
  const levels: (readonly GuideStep[])[] = [];
  const left = new Set(wanted);
  left.delete(startKey(lesson));
  for (const level of sharedLevels(lesson)) {
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
function guideLines(lesson: Lesson, band: number | undefined, wanted: ReadonlySet<PositionKey>) {
  const start = startKey(lesson);
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
  levelsTo(lesson, wanted).forEach((level, i) => {
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
  return { start, moves, lines: linesInto(reached, wanted) };
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
