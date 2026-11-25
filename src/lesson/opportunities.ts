/**
 * A lesson's list of opportunities (docs/plans/opportunities.md, piece G):
 * the marked mistakes of the side the learner plays against, ranked by what
 * knowing each is worth per game in the opponent's band. Derived from the
 * lesson file on demand; nothing stores the list.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { keyTurn, parsePosition, playMove, positionKey, readPositionKey } from '@/game/replay';
import { type Move, reachOf } from '@/opportunity/finder';

import type { Lesson, LessonMove, PositionKey, Uci } from './lesson';
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
   * while the learner plays the guide's moves (`reachOf`).
   */
  readonly reach: number;
  /** The mistake's share of the band's games at `key`, where counted. */
  readonly share?: number;
  /** The punishment ends in mate. */
  readonly mates: boolean;
  /**
   * The share of games that reach the cue × the mistake's gain in the band:
   * what knowing it is worth per game. Absent until the gain is measured (a
   * trap migrated from a guide).
   */
  readonly score?: number;
}

/**
 * The other side's marked mistakes in `lesson`, each with the position it is
 * played in, in the file's order. Read once per lesson, since a big lesson
 * has many positions and the screen asks on every render.
 */
function markedMistakes(lesson: Lesson): readonly { key: PositionKey; move: LessonMove }[] {
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
const marked = new WeakMap<Lesson, readonly { key: PositionKey; move: LessonMove }[]>();

/** Whether `lesson` marks any of the other side's mistakes, so it may list opportunities. */
export const marksOpportunities = (lesson: Lesson) => markedMistakes(lesson).length > 0;

/**
 * The opportunities of `lesson` in `band` (an index into its rating bands,
 * none where it has no counts), the scored ones best first, then the
 * unscored in the file's order. A mistake the guide's moves don't reach
 * from the start is left out, since no row could play into it. Worked out
 * once per lesson and band, since a big lesson's walk takes a while.
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
  const reach = reachOf(walk.start, walk.moves);
  const found = mistakes.flatMap(({ key, move }): Opportunity[] => {
    const into = walk.lines.get(key);
    if (!into) return [];
    const pos = readPositionKey(key)!;
    const share = bandShare(lesson.positions[key], band)(move);
    const san = playMove(pos, move.uci)!.san;
    const reached = reach(key, true);
    const gain = band === undefined ? undefined : move.mistake?.gain?.[band];
    return [
      {
        key,
        move,
        san,
        next: positionKey(pos),
        line: [...into, move.uci],
        reach: reached,
        share,
        mates: mates(lesson, key, move),
        score: gain === undefined || share === undefined ? undefined : reached * share * gain,
      },
    ];
  });
  // Array.sort is stable, so the unscored keep the file's order.
  return found.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
}

/**
 * A breadth-first walk of the guide from the lesson's start, through the
 * moves the finder counts as on the guide: the learner's by its choice rule
 * (`guideOrder`), every one of the opponent's. It gives the moves `reachOf`
 * reads, each with the opponent's share in `band`, and the line into each of
 * `wanted`: of the lines with fewest moves, the one games play most often.
 * It stops once the walk has passed the depth of every position wanted.
 */
function guideLines(lesson: Lesson, band: number | undefined, wanted: ReadonlySet<PositionKey>) {
  const startPos = parsePosition(lesson.start)!;
  const start = positionKey(startPos);
  // Each position reached: how deep, how likely its likeliest fewest-move line, and that line's last step.
  const reached = new Map<
    PositionKey,
    { depth: number; odds: number; from?: PositionKey; uci?: Uci }
  >([[start, { depth: 0, odds: 1 }]]);
  const moves: Move[] = [];
  let level: [PositionKey, Chess][] = [[start, startPos]];
  let left = wanted.size - (wanted.has(start) ? 1 : 0);
  for (let depth = 1; level.length && left > 0; depth++) {
    const next: [PositionKey, Chess][] = [];
    for (const [from, pos] of level) {
      const entry = lesson.positions[from];
      if (!entry) continue;
      const learner = pos.turn === lesson.side;
      const share = bandShare(entry, band);
      const odds = reached.get(from)!.odds;
      for (const move of learner ? guideOrder(lesson, from, lesson.side) : entry.moves) {
        // A shipped lesson's moves are checked (check.ts), so this skips playMove's checks and move names.
        const after = pos.clone();
        after.play(parseUci(move.uci)!);
        const to = positionKey(after);
        const moveShare = learner ? 1 : (share(move) ?? 0);
        moves.push({ from, to, share: moveShare, guided: true, chosen: learner });
        const known = reached.get(to);
        if (!known) {
          reached.set(to, { depth, odds: odds * moveShare, from, uci: move.uci });
          next.push([to, after]);
          if (wanted.has(to)) left--;
        } else if (known.depth === depth && odds * moveShare > known.odds) {
          reached.set(to, { depth, odds: odds * moveShare, from, uci: move.uci });
        }
      }
    }
    level = next;
  }
  const lineTo = (key: PositionKey): Uci[] => {
    const { from, uci } = reached.get(key)!;
    return from === undefined ? [] : [...lineTo(from), uci!];
  };
  const lines = new Map(
    [...wanted].filter((key) => reached.has(key)).map((key) => [key, lineTo(key)]),
  );
  return { start, moves, lines };
}

/** Whether the line `move`, a marked mistake at `key`, starts ends in checkmate. */
function mates(lesson: Lesson, key: PositionKey, move: LessonMove): boolean {
  const pos = readPositionKey(key)!;
  // Checked lines (check.ts), so this skips playMove's checks and move names, as `guideLines` does.
  for (const uci of mistakeLine(lesson, key, move)) pos.play(parseUci(uci)!);
  return pos.isCheckmate();
}
