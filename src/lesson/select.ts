/**
 * Reading the lesson tree: where a position stands in the guide, and the
 * guide's moves there (the candidate moves) in the order the screen lists
 * them. Pure functions over the lesson file, like the rest of src/lesson/.
 */
import type { SquareName } from 'chessops/types';

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
   * An opponent's move played under `RARE_SHARE` of the time (see
   * `candidates`): the list and the board's arrows leave it off, and only
   * pointing at its piece or landing square shows it.
   */
  readonly rare?: boolean;
}

/**
 * An opponent's candidate played less often than this, as a share of the
 * candidates' games, is rare. A study can give twenty rare replies a line
 * each, and listing them all buries the few that are played.
 */
export const RARE_SHARE = 0.05;

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
    const after = pos.clone();
    const played = playMove(after, move.uci);
    // checkLesson proves every guide move legal, so this is a broken file.
    if (!played) throw new Error(`Guide move ${move.uci} is illegal in ${key}`);
    const { san, from, to } = played;
    const next = positionKey(after);
    const games = count(move);
    return {
      move,
      san,
      from,
      to,
      next,
      variation: lesson.positions[next]?.variation,
      share: total > 0 && games !== undefined ? games / total : undefined,
    };
  });
  // Array.sort is stable, so equal counts keep the file's order.
  rows.sort((a, b) => (count(b.move) ?? -1) - (count(a.move) ?? -1));
  return pos.turn === lesson.side ? rows : rareLast(rows, trapStarts(guide.entry));
}

/**
 * The opponent's `rows`, most played first, with the rare ones marked and
 * moved last. A row under `RARE_SHARE` is rare unless it is the most played,
 * has no counts, or starts one of `traps`.
 */
function rareLast(rows: readonly Candidate[], traps: readonly Uci[]): Candidate[] {
  const isRare = ({ move, share }: Candidate, n: number) =>
    n > 0 && share !== undefined && share < RARE_SHARE && !traps.includes(move.uci);
  const marked = rows.map((row, n) => (isRare(row, n) ? { ...row, rare: true } : row));
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
export const isBook = (lesson: Lesson, key: PositionKey, uci: Uci): boolean =>
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
