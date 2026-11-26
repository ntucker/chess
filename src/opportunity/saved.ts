/**
 * Finds the learner saved (docs/plans/opportunities.md, piece L), remembered
 * on the device by lesson: each the lesson fragment the importer writes (the
 * line, the mistake, the cue's replies and Act III), so a lesson plays it
 * back as it plays its own marks (`withSavedFinds`), with the numbers its
 * one source measured, which the network answers behind them don't outlive.
 * It is read and saved through src/resources/savedFinds.ts.
 */
import { INITIAL_FEN } from 'chessops/fen';

import { lastStep, parsePosition, positionKey } from '@/game/replay';
import { type FindFragment, findPlays, writeFinds } from '@/lesson/finds';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';
import { MAIA_RATINGS } from '@/maia/ratings';
import { isObject, parseStoredObject } from '@/context/storage';

import { type Find, rankBy } from './finder';
import type { ReplySource } from './walk';

/** A find as the device keeps it. */
export interface SavedFind {
  /** Act I: the moves from the starting position to where the opponent errs. */
  readonly line: readonly Uci[];
  readonly mistake: Uci;
  /** The punishing replies the cue accepts, best first. */
  readonly replies: readonly Uci[];
  /** Act III: the moves after the best reply. */
  readonly payoff: readonly Uci[];
  /** What the mistake gives away, by Stockfish's full searches (`Find.cost`). */
  readonly cost: number;
  /** Whose replies measured the numbers below: they never rank beside another source's. */
  readonly source: ReplySource;
  /** The share of games that reach the position before the mistake (`Find.reach`). */
  readonly reach: number;
  /** The mistake's share of the games at its position (`Find.share`). */
  readonly share: number;
  /** What knowing it is worth per game (`Find.score`). */
  readonly score: number;
}

/** Every lesson's saved finds, by lesson id. */
export type SavedFinds = Readonly<Record<string, readonly SavedFind[]>>;

/** `find`, run with replies from `source`, as the device keeps it. */
export const savedFind = (
  { line, mistake, replies, payoff, cost, reach, share, score }: Find,
  source: ReplySource,
): SavedFind => ({ line, mistake, replies, payoff, cost, source, reach, share, score });

/** The position `find`'s mistake leads to, its cue: one find is kept per cue, as the finder keeps one. */
export const cueOf = ({ line, mistake }: Pick<SavedFind, 'line' | 'mistake'>): PositionKey =>
  lastStep([...line, mistake]).key;

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

const START = parsePosition(INITIAL_FEN)!;

/** `value` as a saved find, in a list for `flatMap`: empty where it isn't one. */
function readFind(value: unknown): SavedFind[] {
  if (!isObject(value)) return [];
  const { line, mistake, replies, payoff, cost, source, reach, share, score } = value;
  const numbers = [cost, reach, share, score];
  if (
    !isMoves(line) ||
    typeof mistake !== 'string' ||
    !isMoves(replies) ||
    !replies.length ||
    !isMoves(payoff) ||
    !numbers.every((n) => typeof n === 'number' && Number.isFinite(n)) ||
    !isSource(source)
  )
    return [];
  const find = { line, mistake, replies, payoff, cost, source, reach, share, score } as SavedFind;
  return findPlays(START, undefined, find) ? [find] : [];
}

const isMoves = (value: unknown): value is Uci[] =>
  Array.isArray(value) && value.every((uci) => typeof uci === 'string');

function isSource(value: unknown): value is ReplySource {
  if (!isObject(value)) return false;
  if (value.from === 'lichess') return typeof value.band === 'number';
  return value.from === 'maia' && (MAIA_RATINGS as readonly unknown[]).includes(value.rating);
}

/**
 * `lesson` with `finds` written into its tree (`writeFinds`), so it plays
 * each back as it plays its own marks. A find on a mistake the lesson already
 * marks is left to the lesson's own mark, with its counted numbers. The
 * numbers a source measured stay off the tree, where they would rank beside
 * the lesson's counted ones: the marks carry the cost alone. Worked out once
 * per lesson and list of finds; with none, it is `lesson` itself.
 */
export function withSavedFinds(lesson: Lesson, finds: readonly SavedFind[] | undefined): Lesson {
  if (!finds?.length) return lesson;
  let byFinds = merged.get(lesson);
  if (!byFinds) merged.set(lesson, (byFinds = new WeakMap()));
  let written = byFinds.get(finds);
  if (!written) {
    const fragments = finds.filter((find) => !marks(lesson, find)).map(fragment);
    byFinds.set(finds, (written = writeFinds(lesson, fragments)));
  }
  return written;
}
const merged = new WeakMap<Lesson, WeakMap<readonly SavedFind[], Lesson>>();

/** Whether `lesson` already marks `find`'s mistake where it is played. */
function marks(lesson: Lesson, { line, mistake }: SavedFind): boolean {
  const key = line.length ? lastStep(line).key : positionKey(START);
  return !!lesson.positions[key]?.moves.some((move) => move.uci === mistake && move.mistake);
}

const fragment = ({ line, mistake, replies, payoff, cost }: SavedFind): FindFragment => ({
  line,
  mistake,
  replies,
  payoff,
  cost,
});

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
