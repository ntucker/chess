/**
 * Finds the learner saved (docs/plans/opportunities.md, piece L), remembered
 * on the device by lesson: each the lesson fragment the importer writes (the
 * line, the mistake, the cue's replies and Act III), so a lesson plays it
 * back as it plays its own marks (`withSavedFinds`), with the numbers its
 * one source measured, which the network answers behind them don't outlive.
 * It is read and saved through src/resources/savedFinds.ts.
 */
import { Chess } from 'chessops/chess';

import { isObject, parseStoredObject } from '@/context/storage';
import { lastStep, positionKey } from '@/game/replay';
import { type FindFragment, findPlays, writeFinds } from '@/lesson/finds';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';
import { guideMove } from '@/lesson/select';
import { RATING_BANDS } from '@/lichess/explorer';
import { MAIA_RATINGS } from '@/maia/ratings';

import { type Find, rankBy } from './finder';
import type { ReplySource } from './walk';

/**
 * A find as the device keeps it: its moves and cost as the lesson's tree
 * keeps them, and the numbers its one source measured.
 */
export interface SavedFind
  extends Omit<FindFragment, 'gain'>, Pick<Find, 'reach' | 'share' | 'score'> {
  /** Whose replies measured `reach`, `share` and `score`: they never rank beside another source's. */
  readonly source: ReplySource;
}

/** Every lesson's saved finds, by lesson id. */
export type SavedFinds = Readonly<Record<string, readonly SavedFind[]>>;

/** `find`, run with replies from `source`, as the device keeps it. */
export const savedFind = (
  { line, mistake, replies, payoff, cost, reach, share, score }: Find,
  source: ReplySource,
): SavedFind => ({ line, mistake, replies, payoff, cost, source, reach, share, score });

/**
 * The position `find`'s mistake leads to, its cue: one find is kept per cue,
 * as the finder keeps one. Worked out once per find, since it replays the line.
 */
export function cueOf(find: SavedFind): PositionKey {
  let cue = cues.get(find);
  if (cue === undefined) cues.set(find, (cue = lastStep([...find.line, find.mistake]).key));
  return cue;
}
const cues = new WeakMap<SavedFind, PositionKey>();

/** `saved` with `find` among the lesson `lesson`'s, in place of one saved at its cue. */
export function withSaved(saved: SavedFinds, lesson: string, find: SavedFind): SavedFinds {
  const cue = cueOf(find);
  return { ...saved, [lesson]: [...(saved[lesson] ?? []).filter((f) => cueOf(f) !== cue), find] };
}

/** `saved` without the lesson `lesson`'s find at `cue`. */
export function withoutSaved(saved: SavedFinds, lesson: string, cue: PositionKey): SavedFinds {
  const kept = (saved[lesson] ?? []).filter((find) => cueOf(find) !== cue);
  const { [lesson]: _gone, ...rest } = saved;
  return kept.length ? { ...rest, [lesson]: kept } : rest;
}

/** The shape `savedFindsText` writes; a save in another version reads as none. */
const VERSION = 1;

/** `saved` as the text the device keeps. */
export const savedFindsText = (saved: SavedFinds) =>
  JSON.stringify({ version: VERSION, lessons: saved });

/**
 * The saved finds kept as `text` (`savedFindsText`). A save in another
 * version reads as none; a find missing a field, or whose moves don't play
 * from the starting position, is dropped, so a damaged save loses only what
 * it damaged.
 */
export function parseSavedFinds(text: string): SavedFinds {
  const saved = parseStoredObject(text);
  if (saved.version !== VERSION || !isObject(saved.lessons)) return {};
  return Object.fromEntries(
    Object.entries(saved.lessons).flatMap(([lesson, finds]) => {
      const kept = Array.isArray(finds) ? finds.flatMap(readFind) : [];
      return kept.length ? [[lesson, kept]] : [];
    }),
  );
}

const START = Chess.default();

/** `value` as a saved find, in a list for `flatMap`: empty where it isn't one. */
function readFind(value: unknown): SavedFind[] {
  if (!isObject(value)) return [];
  const { line, mistake, replies, payoff, cost, source, reach, share, score } = value;
  if (
    !isMoves(line) ||
    typeof mistake !== 'string' ||
    !isMoves(replies) ||
    !replies.length ||
    !isMoves(payoff) ||
    !isNumber(cost) ||
    !isNumber(reach) ||
    !isNumber(share) ||
    !isNumber(score) ||
    !isSource(source)
  )
    return [];
  const find: SavedFind = { line, mistake, replies, payoff, cost, source, reach, share, score };
  return findPlays(START, find) ? [find] : [];
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isMoves = (value: unknown): value is Uci[] =>
  Array.isArray(value) && value.every((uci) => typeof uci === 'string');

function isSource(value: unknown): value is ReplySource {
  if (!isObject(value)) return false;
  if (value.from === 'lichess') return (RATING_BANDS as readonly unknown[]).includes(value.band);
  return value.from === 'maia' && (MAIA_RATINGS as readonly unknown[]).includes(value.rating);
}

/**
 * `lesson` with `finds` written into its tree (`writeFinds`), so it plays
 * each back as it plays its own marks. A find on a mistake the lesson already
 * marks is left to the lesson's own mark, with its counted numbers. The
 * numbers a source measured stay off the tree, where they would rank beside
 * the lesson's counted ones: the marks carry the cost alone. With none, it is
 * `lesson` itself. A saved find's moves play (`parseSavedFinds`), and the
 * finder runs for the lesson's side, so its mistake is the other side's.
 */
export const withSavedFinds = (lesson: Lesson, finds: readonly SavedFind[]): Lesson =>
  writeFinds(
    lesson,
    // Without the source's numbers: the mark takes the cost alone.
    finds
      .filter((find) => !marks(lesson, find))
      .map(({ line, mistake, replies, payoff, cost }) => ({
        line,
        mistake,
        replies,
        payoff,
        cost,
      })),
  );

/** Whether `lesson` already marks `find`'s mistake where it is played. */
function marks(lesson: Lesson, { line, mistake }: SavedFind): boolean {
  const key = line.length ? lastStep(line).key : positionKey(START);
  return !!guideMove(lesson, key, mistake)?.mistake;
}

/** Saved finds best first within one source (`rankBy`). */
const bestFirst = rankBy<SavedFind>(({ line, mistake }) => [...line, mistake]);

/** One source's saved finds, best first. */
export interface SavedGroup {
  readonly source: ReplySource;
  readonly finds: readonly SavedFind[];
}

/**
 * `finds` in one group per source, so no score ranks beside another
 * source's: lichess's bands first, lowest first, then Maia's estimates by
 * rating; each group best first.
 */
export function bySource(finds: readonly SavedFind[]): SavedGroup[] {
  const groups = new Map<string, { source: ReplySource; finds: SavedFind[] }>();
  for (const find of finds) {
    const id = sourceId(find.source);
    const group = groups.get(id) ?? { source: find.source, finds: [] };
    group.finds.push(find);
    groups.set(id, group);
  }
  return [...groups.values()]
    .sort((a, b) => sourceOrder(a.source) - sourceOrder(b.source))
    .map(({ source, finds: group }) => ({ source, finds: group.sort(bestFirst) }));
}

const sourceId = (source: ReplySource) =>
  source.from === 'lichess' ? `lichess ${source.band}` : `maia ${source.rating}`;

/** Lichess's counted games before Maia's estimates, each by rating. */
const sourceOrder = (source: ReplySource) =>
  source.from === 'lichess' ? source.band : 10_000 + source.rating;
