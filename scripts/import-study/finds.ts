/**
 * The importer's opportunities step (piece D1 of docs/plans/opportunities.md):
 * runs the finder (src/opportunity) over a lesson for the learner's side and
 * writes each kept find on the guide into the tree. The mistake gets a marker
 * (`LessonMove.mistake`) with its cost and its gain in every rating band; the
 * cue's accepted replies and the learner's Act III moves become book moves,
 * the opponent's Act III moves ordinary ones; the marker stores its line only
 * where the guide's choice rule wouldn't give it. `addPathCounts` then writes
 * the explorer's counts and totals on every position of the line each find's
 * mark plays.
 *
 * The finds come from one band's run (`FIND_BAND`, the report's), so a mistake
 * common only in another band is not written; each find's gain is still
 * measured in every band, from that band's replies at the cue.
 */
import { isFinal } from '@/evaluation/evaluation';
import { playLine, positionKey } from '@/game/replay';
import type { Lesson, LessonMove, LessonPosition, PositionKey, Uci } from '@/lesson/lesson';
import { offGuide } from '@/lesson/check';
import { mistakeLine } from '@/lesson/mistakes';
import { guideMove } from '@/lesson/select';
import { cueGain, type Find } from '@/opportunity/finder';
import { LIMITS } from '@/opportunity/limits';
import { type Context, walkTo } from '@/opportunity/walk';

import { startOf } from './engineCheck';
import {
  explorerReplies,
  FIND_BAND,
  finderHost,
  type FinderHost,
  runFinder,
  settle,
} from './finderHost';
import { keepMistakeLines } from './mistakes';
import { type Explorer, isCounted, RATING_BANDS, recount } from './popularity';
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
    const { finds } = await runFinder(host, counted);
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

type Entry = Omit<LessonPosition, 'moves'> & { moves: LessonMove[] };

/** An expected score as the lesson file keeps it: to a thousandth, finer than any screen shows. */
const thousandths = (score: number) => Math.round(score * 1000) / 1000;

/** Puts `uci` among `entry`'s moves as `edit` makes it, from the guide's move or else a new one. */
function upsert(entry: Entry, uci: Uci, edit: (move: LessonMove) => LessonMove = (move) => move) {
  const i = entry.moves.findIndex((move) => move.uci === uci);
  entry.moves[i < 0 ? entry.moves.length : i] = edit(entry.moves[i] ?? { uci });
}

const booked = (move: LessonMove): LessonMove => ({ ...move, book: true });

/**
 * `lesson` with each of `finds` in its tree. Along Act I it adds the
 * opponent's replies the guide lacks (the learner's moves there are the
 * guide's, since the find is on it); it marks the mistake with its cost and
 * gain; it books every reply the cue accepts and the learner's Act III moves,
 * and adds the opponent's Act III moves where the guide has none. New
 * positions take the variation of the one before. Each new marker's line is
 * stored only where the guide's choice rule doesn't give it, and every older
 * marker keeps the line it had. A mistake the guide already marks (a trap
 * migrated from a study) keeps its line and verdict and only gains its cost
 * and gain.
 */
export function withFinds(lesson: Lesson, finds: readonly LessonFind[]): Lesson {
  const positions: Record<PositionKey, Entry> = {};
  for (const [key, entry] of Object.entries(lesson.positions))
    positions[key] = { ...entry, moves: [...entry.moves] };
  for (const { find, gain } of finds) {
    let pos = startOf(lesson);
    let variation = positions[positionKey(pos)].variation;
    /** The entry for `pos`, made in the variation of the position before where the guide has none. */
    const here = () => {
      const entry = (positions[positionKey(pos)] ??= { variation, moves: [] });
      variation = entry.variation;
      return entry;
    };
    const play = (uci: Uci, edit?: (move: LessonMove) => LessonMove) => {
      upsert(here(), uci, edit);
      pos = played(pos, uci);
    };
    for (const uci of find.line) {
      if (pos.turn === lesson.side && !here().moves.some((move) => move.uci === uci))
        throw new Error(`A find on the guide plays ${uci}, which the guide lacks there`);
      play(uci);
    }
    const marked = here().moves.find((move) => move.uci === find.mistake)?.mistake;
    const scores = { cost: thousandths(find.cost), gain: gain.map(thousandths) };
    play(find.mistake, (move) => ({
      ...move,
      mistake: marked
        ? { ...marked, ...scores }
        : { ...scores, line: [find.replies[0], ...find.payoff] },
    }));
    if (marked) continue;
    const cue = here();
    for (const uci of [find.replies[0], ...find.payoff])
      play(uci, pos.turn === lesson.side ? booked : undefined);
    // After the best reply, so the guide's choice rule plays it first where no counts say otherwise.
    for (const uci of find.replies.slice(1)) upsert(cue, uci, booked);
  }
  // The new markers store their whole line, so this keeps each as written; the
  // older ones keep the guide's line they had before.
  return keepMistakeLines(lesson, { ...lesson, positions: positions as Lesson['positions'] });
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
