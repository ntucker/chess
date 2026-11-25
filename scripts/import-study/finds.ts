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
import { parsePosition, positionKey } from '@/game/replay';
import type { Lesson, LessonMove, LessonPosition, PositionKey, Uci } from '@/lesson/lesson';
import { cueGain, type Find } from '@/opportunity/finder';
import { LIMITS, MIN_GAMES } from '@/opportunity/limits';
import { repliesFrom, walkTo } from '@/opportunity/walk';

import { finderHost, type FinderHost, runFinder, settle } from './finderHost';
import { keepMistakeLines } from './mistakes';
import { type Explorer, measured, RATING_BANDS, withCounts } from './popularity';
import { played } from './study';

/** The explorer's band the finds come from: the report's default, where piece B's gate set the limits. */
export const FIND_BAND = 1400;

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
  const spot = { line: cue.line, key: cue.key };
  const gains: number[] = [];
  for (const band of RATING_BANDS) {
    const { counts, total } = await explorer(cue.key, band, { total: true });
    const replies = repliesFrom(cue.key, counts, MIN_GAMES, total);
    gains.push(
      await settle(host, (ask) => {
        const after = host.answers.analysis(spot);
        if (!isFinal(after)) return void ask({ kind: 'full', spot });
        const context = {
          side: lesson.side,
          answers: host.answers,
          limits: LIMITS,
          ask: (kind: 'replies' | 'sketch' | 'full', at: typeof spot) =>
            ask({ kind, spot: { line: at.line, key: at.key } }),
        };
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
    let pos = parsePosition(lesson.start)!;
    let variation = positions[positionKey(pos)].variation;
    /** The entry where the next move is played, and that move's index in it (-1 if absent). */
    const at = (uci: Uci) => {
      const entry = (positions[positionKey(pos)] ??= { variation, moves: [] });
      variation = entry.variation;
      return { entry, i: entry.moves.findIndex((move) => move.uci === uci) };
    };
    /** Plays `uci`, first making it a guide move as `edit` says (`edit` gets undefined where it is new). */
    const play = (uci: Uci, edit: (move: LessonMove | undefined) => LessonMove) => {
      const { entry, i } = at(uci);
      if (i < 0) entry.moves.push(edit(undefined));
      else entry.moves[i] = edit(entry.moves[i]);
      pos = played(pos, uci);
    };
    const book = (uci: Uci) => (move: LessonMove | undefined) => ({
      ...(move ?? { uci }),
      book: true,
    });
    const ordinary = (uci: Uci) => (move: LessonMove | undefined) => move ?? { uci };
    for (const uci of find.line) {
      if (pos.turn === lesson.side && at(uci).i < 0)
        throw new Error(`A find on the guide plays ${uci}, which the guide lacks there`);
      play(uci, ordinary(uci));
    }
    const { entry, i } = at(find.mistake);
    const marked = i >= 0 ? entry.moves[i].mistake : undefined;
    const measured = { cost: thousandths(find.cost), gain: gain.map(thousandths) };
    play(find.mistake, (move) => ({
      ...(move ?? { uci: find.mistake }),
      mistake: marked
        ? { ...marked, ...measured }
        : { ...measured, line: [find.replies[0], ...find.payoff] },
    }));
    if (marked) continue;
    const cue = at(find.replies[0]).entry;
    for (const uci of [find.replies[0], ...find.payoff])
      play(uci, pos.turn === lesson.side ? book(uci) : ordinary(uci));
    // After the best reply, so the guide's choice rule plays it first where no counts say otherwise.
    for (const uci of find.replies.slice(1)) {
      const r = cue.moves.findIndex((move) => move.uci === uci);
      cue.moves[r < 0 ? cue.moves.length : r] = book(uci)(cue.moves[r]);
    }
  }
  // The new markers store their whole line, so this keeps each as written; the
  // older ones keep the guide's line they had before.
  return keepMistakeLines(lesson, { ...lesson, positions: positions as Lesson['positions'] });
}

/**
 * `lesson` with the lichess counts on every position a move of `finds`' paths
 * is played in: each move's games and the games reaching the position, per
 * band, from one explorer answer each (asked with its total). Popularity,
 * which runs after, keeps them where it doesn't ask.
 */
export async function addPathCounts(
  lesson: Lesson,
  finds: readonly LessonFind[],
  explorer: Explorer,
): Promise<Lesson> {
  const keys = new Set<PositionKey>();
  for (const { find } of finds) {
    let pos = parsePosition(lesson.start)!;
    for (const uci of pathOf(find)) {
      keys.add(positionKey(pos));
      pos = played(pos, uci);
    }
  }
  const positions = { ...lesson.positions };
  for (const key of keys) {
    const answers = [];
    for (const band of RATING_BANDS) answers.push(await explorer(key, band, { total: true }));
    positions[key] = withCounts(positions[key], measured(positions[key].moves, answers));
  }
  return { ...lesson, positions };
}
