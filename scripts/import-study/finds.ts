/**
 * The importer's opportunities step (piece D1 of docs/plans/opportunities.md):
 * runs the finder (src/opportunity) over a lesson for the learner's side and
 * writes each kept find on the guide into the tree. The mistake gets a marker
 * (`LessonMove.mistake`) with its cost and its gain in every rating band; the
 * cue's accepted replies and the learner's Act III moves become book moves,
 * the opponent's Act III moves ordinary ones; the marker stores its line only
 * where the guide's choice rule wouldn't give it. `addPathCounts` then writes
 * the explorer's counts and totals on every position of a find's path.
 *
 * The finds come from one band's run (`FIND_BAND`, the report's), so a mistake
 * common only in another band is not written; each find's gain is still
 * measured in every band, from that band's replies at the cue.
 */
import { isFinal } from '@/evaluation/evaluation';
import { playLine, positionKey } from '@/game/replay';
import type { Lesson, LessonMove, LessonPosition, PositionKey, Uci } from '@/lesson/lesson';
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
import { type Explorer, measured, RATING_BANDS, withCounts } from './popularity';
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

/** The moves of a find from the start: Act I, the mistake, its best reply and Act III. */
const pathOf = ({ line, mistake, replies, payoff }: Find): Uci[] => [
  ...line,
  mistake,
  replies[0],
  ...payoff,
];

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
 * `lesson` with the lichess counts on every position of its tree a move of
 * `finds`' paths is played in: each move's games and the games reaching the
 * position, per band, from one explorer answer each (asked with its total).
 * A find whose mistake the guide already marked keeps the guide's line, so its
 * own path can leave the tree. Popularity, which runs after, keeps the counts
 * where it doesn't ask.
 */
export async function addPathCounts(
  lesson: Lesson,
  finds: readonly LessonFind[],
  explorer: Explorer,
): Promise<Lesson> {
  const keys = new Set<PositionKey>();
  for (const { find } of finds) {
    // Every position but the last, where no path move is played.
    for (const { key } of [...playLine(pathOf(find), startOf(lesson))].slice(0, -1))
      if (lesson.positions[key]) keys.add(key);
  }
  const positions = { ...lesson.positions };
  for (const key of keys) {
    const answers = [];
    for (const band of RATING_BANDS) answers.push(await explorer(key, band, { total: true }));
    positions[key] = withCounts(positions[key], measured(positions[key].moves, answers));
  }
  return { ...lesson, positions };
}
