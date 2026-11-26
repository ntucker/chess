/**
 * Writes opportunities into a lesson's guide tree (docs/plans/opportunities.md,
 * pieces D1 and L), so a lesson plays them back as it plays a marked trap
 * (`lineCue` in src/opportunity/cue.ts): the importer writes the finds it
 * keeps into the shipped files, and the app writes the learner's saved finds
 * into the lesson it shows (src/opportunity/saved.ts).
 */
import type { Chess } from 'chessops/chess';

import { parsePosition, playMove, positionKey } from '@/game/replay';

import type { Lesson, LessonMove, LessonPosition, PositionKey, Uci } from './lesson';
import { keepMistakeLines } from './mistakes';

/** An opportunity as a lesson's tree keeps it: its moves, and what the mark records. */
export interface FindFragment {
  /** Act I: the moves from the lesson's start to the position where the opponent errs. */
  readonly line: readonly Uci[];
  /** The opponent's mistake, which gets the mark. */
  readonly mistake: Uci;
  /** The replies that punish it, best first: the first starts the mark's line. */
  readonly replies: readonly Uci[];
  /** Act III: the moves after the best reply. */
  readonly payoff: readonly Uci[];
  /** What the mistake gives away (`Mistake.cost`). */
  readonly cost: number;
  /** What knowing it is worth in each of the lesson's rating bands (`Mistake.gain`), where measured. */
  readonly gain?: readonly number[];
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
 * Whether `find` plays from `start`: every move legal, each other reply legal
 * at the cue, and the mistake played by the side `learner` doesn't play,
 * where given.
 */
export function findPlays(
  start: Chess,
  learner: Lesson['side'] | undefined,
  find: Pick<FindFragment, 'line' | 'mistake' | 'replies' | 'payoff'>,
): boolean {
  const pos = start.clone();
  if (!find.line.every((uci) => playMove(pos, uci))) return false;
  if (pos.turn === learner || !playMove(pos, find.mistake)) return false;
  const cue = pos.clone();
  if (!find.replies.slice(1).every((uci) => playMove(cue.clone(), uci))) return false;
  return [find.replies[0], ...find.payoff].every((uci) => uci !== undefined && playMove(pos, uci));
}

/**
 * `lesson` with each of `finds` in its tree, leaving out any that doesn't
 * play from its start (`findPlays`). Along Act I it adds the moves the guide
 * lacks, the learner's as ordinary moves, not book moves; it marks the
 * mistake with its cost and any gain; it books every reply the cue accepts
 * and the learner's Act III moves, and adds the opponent's Act III moves
 * where the guide has none. New positions take the variation of the one
 * before. Each new marker's line is stored only where the guide's choice
 * rule doesn't give it, and every older marker keeps the line it had. A
 * mistake the guide already marks (a trap migrated from a study) keeps its
 * line and verdict and only gains its cost and gain.
 */
export function writeFinds(lesson: Lesson, finds: readonly FindFragment[]): Lesson {
  const start = parsePosition(lesson.start)!;
  const written = finds.filter((find) => findPlays(start, lesson.side, find));
  if (!written.length) return lesson;
  const positions: Record<PositionKey, Entry> = {};
  for (const [key, entry] of Object.entries(lesson.positions))
    positions[key] = { ...entry, moves: [...entry.moves] };
  for (const find of written) {
    const pos = start.clone();
    let variation = positions[positionKey(pos)].variation;
    /** The entry for `pos`, made in the variation of the position before where the guide has none. */
    const here = () => {
      const entry = (positions[positionKey(pos)] ??= { variation, moves: [] });
      variation = entry.variation;
      return entry;
    };
    const play = (uci: Uci, edit?: (move: LessonMove) => LessonMove) => {
      upsert(here(), uci, edit);
      playMove(pos, uci);
    };
    for (const uci of find.line) play(uci);
    const marked = here().moves.find((move) => move.uci === find.mistake)?.mistake;
    const scores = {
      cost: thousandths(find.cost),
      ...(find.gain && { gain: find.gain.map(thousandths) }),
    };
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
