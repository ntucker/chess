/**
 * Reading the lesson tree: where a position stands in the guide, and the
 * guide's moves there (the candidate moves) in the order the screen lists
 * them. Pure functions over the lesson file, like the rest of src/lesson/.
 */
import { makeSan } from 'chessops/san';
import type { Piece, SquareName } from 'chessops/types';
import { makeSquare, parseUci } from 'chessops/util';

import { parsePositionKey, playLine, positionKey } from '@/game/replay';
import type { Opponent } from '@/opponent/opponent';

import {
  type Lesson,
  type LessonMove,
  type LessonPosition,
  type PositionKey,
  ratingBandIndex,
  type Uci,
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

/** One of the guide's moves at a position, with what its list row shows. */
export interface Candidate {
  /** The move as the lesson file stores it: book flag, risk, notes. */
  readonly move: LessonMove;
  readonly san: string;
  readonly from: SquareName;
  /** Where the piece lands; the king's square for castling. */
  readonly to: SquareName;
  readonly piece: Piece;
  /** The position the move leads to. */
  readonly next: PositionKey;
  /** The variation of `next`, or undefined when the move leads beyond the guide. */
  readonly variation?: VariationId;
  /**
   * The move's share of the candidates' games in the band, from 0 to 1;
   * undefined when the band has no games for this move or for any of them.
   */
  readonly share?: number;
}

/**
 * The guide's moves at `key`, most played in `band` first (an index into
 * `LessonMove.games`). Ties, and moves without counts, keep the file's order,
 * which puts the main line first; so with no counts at all the order is the
 * file's. Empty unless `key` is inside the guide.
 */
export function candidates(
  lesson: Lesson,
  key: PositionKey,
  band: number | undefined,
): Candidate[] {
  const entry = guidePosition(lesson, key);
  const pos = entry.place === 'inside' ? parsePositionKey(key) : undefined;
  if (entry.place !== 'inside' || !pos) return [];

  const count = (move: LessonMove) => (band === undefined ? undefined : move.games?.[band]);
  const total = entry.entry.moves.reduce((sum, move) => sum + (count(move) ?? 0), 0);
  const rows = entry.entry.moves.map((move): Candidate => {
    const parsed = parseUci(move.uci);
    if (!parsed || !('from' in parsed)) throw new Error(`Not a board move: ${move.uci}`);
    const after = pos.clone();
    after.play(parsed);
    const next = positionKey(after);
    const games = count(move);
    return {
      move,
      san: makeSan(pos, parsed),
      from: makeSquare(parsed.from),
      to: makeSquare(parsed.to),
      piece: pos.board.get(parsed.from)!,
      next,
      variation: lesson.positions[next]?.variation,
      share: total > 0 && games !== undefined ? games / total : undefined,
    };
  });
  // Array.sort is stable, so equal counts keep the file's order.
  return rows.sort((a, b) => (count(b.move) ?? -1) - (count(a.move) ?? -1));
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
export function variationPath(lesson: Lesson, id: VariationId): VariationId[] {
  const path: VariationId[] = [];
  for (let at: VariationId | undefined = id; at !== undefined; at = lesson.variations[at]?.parent) {
    path.unshift(at);
  }
  return path;
}

/** The key of each position in `line`: index `n` is the position after `n` moves. */
export function lineKeys(line: readonly Uci[]): PositionKey[] {
  return Array.from(playLine(line), ({ pos }) => positionKey(pos));
}
