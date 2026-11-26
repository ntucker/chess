/**
 * The importer's opportunities step (piece D1 of docs/plans/opportunities.md):
 * runs the finder (src/opportunity) over a lesson for the learner's side and
 * writes each kept find on the guide into the tree (`writeFinds` in
 * src/lesson/finds.ts), its mark with its gain in every rating band.
 * `addPathCounts` then writes
 * the explorer's counts and totals on every position of the line each find's
 * mark plays.
 *
 * The finds come from one band's run (`FIND_BAND`, the report's), so a mistake
 * common only in another band is not written; each find's gain is still
 * measured in every band, from that band's replies at the cue.
 */
import { isFinal } from '@/evaluation/evaluation';
import { playLine, positionKey } from '@/game/replay';
import { offGuide } from '@/lesson/check';
import { writeFinds } from '@/lesson/finds';
import type { Lesson, PositionKey } from '@/lesson/lesson';
import { keepMistakeLines, mistakeLine } from '@/lesson/mistakes';
import { guideMove } from '@/lesson/select';
import { cueGain, type Find } from '@/opportunity/finder';
import { LIMITS } from '@/opportunity/limits';
import { type Context, walkTo } from '@/opportunity/walk';
import { RATING_BANDS } from '@/lichess/explorer';

import { startOf } from './engineCheck';
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
    for (const find of finds)
      written.push({ find, gain: await gainByBand(host, counted, find, explorer) });
    return written;
  } finally {
    host.stop();
  }
}

/** `find`'s gain in each of `RATING_BANDS`, from that band's replies at its cue. */
async function gainByBand(
  host: FinderHost,
  lesson: Lesson,
  find: Find,
  explorer: Explorer,
): Promise<number[]> {
  const cue = walkTo(lesson.start, [...find.line, find.mistake])!;
  const gains: number[] = [];
  for (const band of RATING_BANDS) {
    const replies = explorerReplies(cue.key, await explorer(cue.key, band, { total: true }));
    gains.push(
      await settle(host, (ask) => {
        const context: Context = {
          side: lesson.side,
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
  // One at a time, so a move an earlier find wrote (its booked Act III) counts as the guide's.
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
 * `lesson` (with `finds` written in) with the lichess counts on every position
 * of each find's marked path (`markedPositions`): each move's games and the
 * games reaching the position, per band, from one explorer answer each (asked
 * with its total). The counts can change the guide's choices, so each mark
 * keeps the line it had (`keepMistakeLines`): the line counted is the line
 * played. Popularity, which runs after, keeps the counts where it doesn't ask.
 */
export async function addPathCounts(
  lesson: Lesson,
  finds: readonly LessonFind[],
  explorer: Explorer,
): Promise<Lesson> {
  const keys = new Set(finds.flatMap(({ find }) => markedPositions(lesson, find)));
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
