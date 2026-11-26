/**
 * The importer's opportunities step (pieces D1 and D3 of
 * docs/plans/opportunities.md): on a lesson whose recipe sets
 * `opportunities`, runs the finder (src/opportunity) for the learner's side
 * and writes each kept find on the guide into the tree (`writeFinds` in
 * src/lesson/finds.ts), its mark with its gain in every rating band. On every
 * lesson it measures each mark the finds didn't (`measureMarks`: the traps
 * migrated from the studies, either side's), and `addPathCounts` then writes
 * the explorer's counts and totals where each mark is judged.
 *
 * The finds come from one band's run (`FIND_BAND`, the report's), so a mistake
 * common only in another band is not written; each find's gain is still
 * measured in every band, from that band's replies at the cue.
 */
import { moveLoss } from '@/analysis/quality';
import { isFinal } from '@/evaluation/evaluation';
import { parsePositionKey, playLine, positionKey } from '@/game/replay';
import { offGuide } from '@/lesson/check';
import { type MarkMeasure, writeFinds } from '@/lesson/finds';
import type { Lesson, PositionKey } from '@/lesson/lesson';
import { keepMistakeLines, markedMoves, markId, mistakeLine } from '@/lesson/mistakes';
import { guideMove } from '@/lesson/select';
import { cueGain, type Find } from '@/opportunity/finder';
import { LIMITS } from '@/opportunity/limits';
import { type Context, type Node, walkTo } from '@/opportunity/walk';
import { RATING_BANDS } from '@/lichess/explorer';

import { linesTo, startOf } from './engineCheck';
import {
  explorerReplies,
  FIND_BAND,
  finderHost,
  type FinderHost,
  lessonStart,
  runFinder,
  settle,
} from './finderHost';
import { type Explorer, isCounted, recount } from './popularity';
import { played } from './study';

/** A find to write into a lesson, and what knowing it is worth in each of `RATING_BANDS`. */
export interface LessonFind {
  readonly find: Find;
  readonly gain: readonly number[];
}

/**
 * The finds on the guide that `counted` keeps for its side at `FIND_BAND`,
 * best first, each with its gain per band. `counted` is the lesson with the
 * counts `guideOrder` picks by, as the report reads the shipped file; the
 * cue's replies in each band come from `explorer`, with their totals.
 */
export async function lessonFinds(counted: Lesson, explorer: Explorer): Promise<LessonFind[]> {
  const host = await finderHost(counted, FIND_BAND);
  try {
    const { finds } = await runFinder(host, lessonStart(counted));
    const written: LessonFind[] = [];
    for (const find of finds) {
      const cue = walkTo(counted.start, [...find.line, find.mistake])!;
      written.push({ find, gain: await gainByBand(host, cue, explorer) });
    }
    return written;
  } finally {
    host.stop();
  }
}

/**
 * Each of `lesson`'s marks without a cost (a trap migrated from a study),
 * measured as the finder measures a find: its cost from full searches of the
 * positions before and after it, and its gain in each of `RATING_BANDS` from
 * that band's replies at the cue (`explorer`, with totals) for the side that
 * punishes it. Either side's marks, so a trap the learner falls into holds the
 * opponent's numbers. Each is reached by the guide's first line to it
 * (`linesTo`).
 */
export async function measureMarks(lesson: Lesson, explorer: Explorer): Promise<MarkMeasure[]> {
  const unmeasured = markedMoves(lesson).filter(({ move }) => move.mistake.cost === undefined);
  if (!unmeasured.length) return [];
  const lines = linesTo(lesson);
  const host = await finderHost(lesson, FIND_BAND);
  try {
    const measures: MarkMeasure[] = [];
    for (const { key, move } of unmeasured) {
      const before = walkTo(lesson.start, lines.get(key)!.line)!;
      const cue = walkTo(lesson.start, [...before.line, move.uci])!;
      const cost = await markCost(host, before, cue);
      measures.push({ key, uci: move.uci, cost, gain: await gainByBand(host, cue, explorer) });
    }
    return measures;
  } finally {
    host.stop();
  }
}

/** What the move from `before` to `cue` gives away for its mover, by full searches of both. */
function markCost(host: FinderHost, before: Node, cue: Node): Promise<number> {
  const uci = cue.line.at(-1)!;
  return settle(host, (ask) => {
    const fullAnalysis = (spot: Node) => {
      const analysis = host.answers.analysis(spot);
      if (!isFinal(analysis)) ask({ kind: 'full', spot });
      return analysis;
    };
    const [above, below] = [fullAnalysis(before), fullAnalysis(cue)];
    if (!isFinal(above) || !isFinal(below)) return undefined;
    const loss = moveLoss(above, below, uci, before.pos.turn)?.loss;
    if (loss === undefined)
      throw new Error(`Stockfish can't judge the mark ${uci} at ${before.key}`);
    // Two searches, so a trap Stockfish rates best can read a hair under 0; it gives away nothing.
    return Math.max(0, loss);
  });
}

/**
 * What knowing the punishment at `cue` is worth in each of `RATING_BANDS`,
 * from that band's replies there, for the side to move at `cue`.
 */
async function gainByBand(host: FinderHost, cue: Node, explorer: Explorer): Promise<number[]> {
  const gains: number[] = [];
  for (const band of RATING_BANDS) {
    const replies = explorerReplies(cue.key, await explorer(cue.key, band, { total: true }));
    gains.push(
      await settle(host, (ask) => {
        const context: Context = {
          side: cue.pos.turn,
          answers: host.answers,
          limits: LIMITS,
          ask: (kind, { line, key }) => ask({ kind, spot: { line, key } }),
        };
        const after = host.answers.analysis(cue);
        if (!isFinal(after)) return void context.ask('full', cue);
        return cueGain(cue, after, replies, context)?.gain;
      }),
    );
  }
  return gains;
}

/** A find's mark (`markId`): the position its mistake is played in, and the mistake. */
const findMark = (lesson: Lesson, find: Find) =>
  markId(walkTo(lesson.start, find.line)!.key, find.mistake);

/**
 * The positions `find`'s mark plays a move in, in `lesson` (which `withFinds`
 * wrote it into), from the start: along Act I, then along the mistake's line
 * (`mistakeLine`). That line is the find's best reply and Act III, or the
 * guide's line where the guide already marked the mistake. Throws where a
 * move of the path is not in the tree.
 */
function markedPositions(lesson: Lesson, find: Find): PositionKey[] {
  const mistakeKey = walkTo(lesson.start, find.line)!.key;
  const path = [
    ...find.line,
    ...mistakeLine(lesson, mistakeKey, guideMove(lesson, mistakeKey, find.mistake)!),
  ];
  const off = offGuide(lesson, startOf(lesson), path);
  if (off !== undefined)
    throw new Error(`The mark on ${find.mistake} plays ${path[off]}, which the tree lacks`);
  // Every position but the last, where no path move is played.
  return [...playLine(path, startOf(lesson))].slice(0, -1).map(({ key }) => key);
}

/**
 * `lesson` with each of `finds` in its tree (`writeFinds`), each with its gain
 * per band. Throws where a find plays a learner move the guide lacks, since
 * only finds on the guide go into a lesson.
 */
export function withFinds(lesson: Lesson, finds: readonly LessonFind[]): Lesson {
  // One at a time, so a move an earlier find wrote (its booked Act III) counts as the guide's;
  // each write copies the lesson, which a study's few finds afford.
  return finds.reduce((tree, { find, gain }) => {
    let pos = startOf(tree);
    for (const uci of find.line) {
      if (pos.turn === tree.side && !guideMove(tree, positionKey(pos), uci))
        throw new Error(`A find on the guide plays ${uci}, which the guide lacks there`);
      pos = played(pos, uci);
    }
    return writeFinds(tree, [{ ...find, gain }]);
  }, lesson);
}

/**
 * `lesson` (with `finds` written in) with the lichess counts on the positions
 * each mark is judged by: each move's games and the games reaching the
 * position, per band, from one explorer answer each (asked with its total).
 * A find's mark is counted on every position of the line it plays
 * (`markedPositions`); any other mark (a trap migrated from a study) on its
 * own position and its cue, where its share and its gains are read, since its
 * whole path would take the explorer hours more on the biggest lessons. The
 * counts can change the guide's choices, so each mark keeps the line it had
 * (`keepMistakeLines`): the line counted is the line played. Popularity, which
 * runs after, keeps the counts where it doesn't ask.
 */
export async function addPathCounts(
  lesson: Lesson,
  finds: readonly LessonFind[],
  explorer: Explorer,
): Promise<Lesson> {
  const found = new Set(finds.map(({ find }) => findMark(lesson, find)));
  const keys = new Set([
    ...finds.flatMap(({ find }) => markedPositions(lesson, find)),
    ...markedMoves(lesson)
      .filter(({ key, move }) => !found.has(markId(key, move.uci)))
      .flatMap(({ key, move }) => [key, positionKey(played(parsePositionKey(key)!, move.uci))]),
  ]);
  return recountKeepingLines(lesson, keys, explorer);
}

/**
 * `lesson` with every position that carries counts counted afresh, for a
 * popularity rerun: popularity keeps the counts where it doesn't ask (a find's
 * path where the guide offers no choice), and the rerun's save keeps only the
 * answers asked, so no count outlives its answer.
 */
export const recountCounted = (lesson: Lesson, explorer: Explorer): Promise<Lesson> =>
  recountKeepingLines(
    lesson,
    Object.keys(lesson.positions).filter((key) => isCounted(lesson.positions[key])),
    explorer,
  );

/** `lesson` with the positions at `keys` counted afresh (`recount`), each mark keeping the line it had. */
const recountKeepingLines = async (
  lesson: Lesson,
  keys: Iterable<PositionKey>,
  explorer: Explorer,
): Promise<Lesson> => keepMistakeLines(lesson, await recount(lesson, keys, explorer));
