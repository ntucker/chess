/**
 * Reading the lesson tree: where a position stands in the guide, and the
 * guide's moves there (the candidate moves) in the order the screen lists
 * them. Pure functions over the lesson file, like the rest of src/lesson/.
 */
import type { Chess } from 'chessops/chess';
import type { SquareName } from 'chessops/types';

import type { Evaluation, TopMove } from '@/evaluation/evaluation';
import { parsePositionKey, playLine, playMove, positionKey } from '@/game/replay';
import type { Opponent } from '@/opponent/opponent';

import {
  type Lesson,
  type LessonMove,
  type LessonPosition,
  type PositionKey,
  ratingBandIndex,
  type Uci,
  type Variation,
  type VariationId,
} from './lesson';

/**
 * Where a position stands in the guide. `inside`: the guide has moves here.
 * `end`: the guide has notes here but no moves, so a line of it ends here.
 * `beyond`: the guide doesn't know the position. Past `inside`, the
 * opponent engine plays and Stockfish's top moves are listed.
 */
export type GuidePosition =
  | { readonly place: 'inside' | 'end'; readonly entry: LessonPosition }
  | { readonly place: 'beyond' };

export function guidePosition(lesson: Lesson, key: PositionKey): GuidePosition {
  const entry = lesson.positions[key] as LessonPosition | undefined;
  if (!entry) return { place: 'beyond' };
  return { place: entry.moves.length ? 'inside' : 'end', entry };
}

/**
 * Where the position `arrivedBy` leads to stands in the guide: as
 * `guidePosition` says, except that a guide move into a position the file
 * doesn't hold ends its line there too. The shipped files keep no entry for
 * a line's last position, so `end` comes mostly from this.
 */
export function linePlace(
  lesson: Lesson,
  key: PositionKey,
  arrivedBy: LessonMove | undefined,
): GuidePosition['place'] {
  const { place } = guidePosition(lesson, key);
  return place === 'beyond' && arrivedBy ? 'end' : place;
}

/** One of the guide's moves at a position, with what its list row shows. */
export interface Candidate {
  /** The move as the lesson file stores it: book flag, risk, notes. */
  readonly move: LessonMove;
  readonly san: string;
  readonly from: SquareName;
  /** Where the piece lands; the king's square for castling. */
  readonly to: SquareName;
  /** The position the move leads to. */
  readonly next: PositionKey;
  /** The variation of `next`, or undefined when the move leads beyond the guide. */
  readonly variation?: VariationId;
  /**
   * The move's share of the candidates' games in the band, from 0 to 1;
   * undefined when the band has no games for this move or for any of them.
   */
  readonly share?: number;
  /**
   * An opponent's move played under `RARE_SHARE` of the time, in a long list
   * (see `rareLast`): the list shows it only when asked, and the board's
   * arrows only while its piece is dragged.
   */
  readonly rare?: boolean;
  /**
   * How the position stands after the move, on a row of Stockfish's top
   * moves (`engineCandidates`), which only these rows have.
   */
  readonly engine?: Evaluation;
}

/**
 * An opponent's candidate played less often than this, as a share of the
 * candidates' games, is rare. A study can give twenty rare replies a line
 * each, and listing them all buries the few that are played.
 */
export const RARE_SHARE = 0.05;

/** The most played this many candidates are never rare, so a short list hides nothing. */
export const ALWAYS_LISTED = 5;

/**
 * Fewer rare candidates than this are listed anyway: the row that shows
 * them on request would save too little room to be worth a click.
 */
export const FEWEST_RARE = 3;

/** The candidate to look at first: the book move, or else the most played. */
export const mainCandidate = (candidates: readonly Candidate[]): Candidate | undefined =>
  candidates.find(({ move }) => move.book) ?? candidates[0];

/**
 * The guide's moves at `key`, most played in `band` first (an index into
 * `LessonMove.games`). Moves without counts follow those with counts; ties,
 * and moves without counts, keep the file's order, which puts the main line
 * first. Empty unless `key` is inside the guide. On the opponent's turn the
 * rare ones are marked and come last (`rareLast`).
 */
export function candidates(
  lesson: Lesson,
  key: PositionKey,
  band: number | undefined,
): Candidate[] {
  const guide = guidePosition(lesson, key);
  const pos = guide.place === 'inside' ? parsePositionKey(key) : undefined;
  if (guide.place !== 'inside' || !pos) return [];

  const count = (move: LessonMove) => (band === undefined ? undefined : move.games?.[band]);
  const total = guide.entry.moves.reduce((sum, move) => sum + (count(move) ?? 0), 0);
  const rows = guide.entry.moves.map((move): Candidate => {
    const row = candidateRow(lesson, pos, move);
    // checkLesson proves every guide move legal, so this is a broken file.
    if (!row) throw new Error(`Guide move ${move.uci} is illegal in ${key}`);
    const games = count(move);
    return { ...row, share: total > 0 && games !== undefined ? games / total : undefined };
  });
  // Array.sort is stable, so equal counts keep the file's order.
  rows.sort((a, b) => (count(b.move) ?? -1) - (count(a.move) ?? -1));
  return pos.turn === lesson.side ? rows : rareLast(rows, trapStarts(guide.entry));
}

/**
 * Stockfish's top moves at `key` as rows of their own, best first, listed
 * where the guide has no candidates. A move that leads back into the guide
 * names its variation, as a guide move does. Example: beyond the guide after
 * 1.e4 c6 2.Qh5, Stockfish's g8f6 is the row Nf6, with the evaluation after it.
 */
export function engineCandidates(
  lesson: Lesson,
  key: PositionKey,
  top: readonly TopMove[],
): Candidate[] {
  const pos = parsePositionKey(key);
  if (!pos) return [];
  return top.flatMap(({ uci, evaluation }) => {
    const row = candidateRow(lesson, pos, { uci });
    return row ? [{ ...row, engine: evaluation }] : [];
  });
}

/** `move` played at `pos`: the row's move, squares and where it leads, or undefined if illegal. */
function candidateRow(
  lesson: Lesson,
  pos: Chess,
  move: LessonMove,
): Omit<Candidate, 'share'> | undefined {
  const after = pos.clone();
  const played = playMove(after, move.uci);
  if (!played) return undefined;
  const { san, from, to } = played;
  const next = positionKey(after);
  return { move, san, from, to, next, variation: lesson.positions[next]?.variation };
}

/**
 * The opponent's `rows`, most played first, with the rare ones marked and
 * moved last. A row past the first `ALWAYS_LISTED` is rare under `RARE_SHARE`,
 * unless it has no counts or starts one of `traps`, and only when at least
 * `FEWEST_RARE` are.
 */
function rareLast(rows: readonly Candidate[], traps: readonly Uci[]): Candidate[] {
  const isRare = ({ move, share }: Candidate, n: number) =>
    n >= ALWAYS_LISTED && share !== undefined && share < RARE_SHARE && !traps.includes(move.uci);
  const marked = rows.map((row, n) => (isRare(row, n) ? { ...row, rare: true } : row));
  if (marked.filter(({ rare }) => rare).length < FEWEST_RARE) return [...rows];
  return [...marked.filter(({ rare }) => !rare), ...marked.filter(({ rare }) => rare)];
}

/** The first move of each trap in a position's notes: the move that falls in. */
const trapStarts = (entry: LessonPosition): Uci[] =>
  (entry.notes ?? []).flatMap(({ ideas = [] }) =>
    ideas.flatMap((idea) => (idea.type === 'trap' ? [idea.moves[0]] : [])),
  );

/** `uci` as the guide stores it at `key`, or undefined if it isn't a guide move there. */
export const guideMove = (lesson: Lesson, key: PositionKey, uci: Uci): LessonMove | undefined =>
  lesson.positions[key]?.moves.find((move) => move.uci === uci);

/** Whether the guide recommends `uci` at `key`: a book move. */
const isBook = (lesson: Lesson, key: PositionKey, uci: Uci): boolean =>
  guideMove(lesson, key, uci)?.book === true;

/** Whether each move of `line` is a book move where it was played. */
export function bookMoves(lesson: Lesson, line: readonly Uci[]): boolean[] {
  const keys = lineKeys(line);
  return line.map((uci, n) => isBook(lesson, keys[n], uci));
}

/**
 * Which popularity band "most common" reads for `opponent`: the highest band
 * at or below its rating (1500 reads 1400), and the top band for Stockfish.
 * Undefined when the lesson has no counts.
 */
export function opponentBand(lesson: Lesson, opponent: Opponent): number | undefined {
  if (!lesson.popularity) return undefined;
  return ratingBandIndex(lesson.popularity, opponent === 'stockfish' ? Infinity : opponent);
}

/** The variation `id` and its ancestors, the opening itself first. */
export function variationPath(lesson: Lesson, id: VariationId): Variation[] {
  const path: Variation[] = [];
  for (let at: VariationId | undefined = id; at !== undefined; at = lesson.variations[at]?.parent) {
    path.unshift(lesson.variations[at]);
  }
  return path;
}

/**
 * A variation's name without a leading "<group>: " that names one of the
 * variations it is read within: within the Advance Variation, "Advance
 * Variation: Tal Variation" is "Tal Variation". A study names a sub-line
 * with its group so the name stands alone; beside the group, that repeats it.
 */
export function nameWithin(name: string, within: readonly Variation[]): string {
  const group = within.findLast((variation) => name.startsWith(`${variation.name}: `));
  return group ? name.slice(group.name.length + 2) : name;
}

/** The names along a `variationPath`, each without what the ones before it say (`nameWithin`). */
export function pathNames(path: readonly Variation[]): string[] {
  return path.map(({ name }, at) => nameWithin(name, path.slice(0, at)));
}

/**
 * The variation a line is in at its last position, as `variationPath`: that
 * position's, or beyond the guide, that of the last guide position it passed.
 */
export function lineVariation(lesson: Lesson, keys: readonly PositionKey[]): Variation[] {
  const last = keys.findLast((key) => lesson.positions[key]);
  return last ? variationPath(lesson, lesson.positions[last].variation) : [];
}

/** The key of each position in `line`: index `n` is the position after `n` moves. */
export function lineKeys(line: readonly Uci[]): PositionKey[] {
  return Array.from(playLine(line), ({ key }) => key);
}
