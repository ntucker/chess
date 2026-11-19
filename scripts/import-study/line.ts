/**
 * Finding where a move or a sequence named in a comment belongs. The study's
 * move numbers are often off by one or two, so a named move is matched by its
 * SAN, and the number only picks between matches, nearest first.
 */
import type { Chess } from 'chessops/chess';
import type { Color } from 'chessops/types';

import { sanToUci } from '@/game/replay';
import type { Idea, Uci } from '@/lesson/lesson';

import { mainLine, played, type StudyMove } from './study';
import type { NamedMove } from './text';

/**
 * A position in a chapter: after `move`, or the chapter's starting position
 * when `move` is undefined.
 */
export interface Spot {
  readonly move?: StudyMove;
  readonly pos: Chess;
}

/** An idea a comment states, and the position it is about. */
export interface Found {
  readonly spot: Spot;
  readonly idea: Idea;
  /** The study's words for the idea; for an evaluation glyph, its sentence. */
  readonly label: string;
  /**
   * The idea's own note when it lands away from its comment: the label in
   * words, without the moves its drawing plays.
   */
  readonly text: string;
}

/** The moves from the chapter's start to `move`, then on along its main continuation. */
function lineThrough(move: StudyMove): StudyMove[] {
  const before: StudyMove[] = [];
  for (let at = move.parent; at; at = at.parent) before.push(at);
  return [...before.reverse(), ...mainLine(move)];
}

/** The move of the line through `move` that `named` names, if there is one. */
export function findOnLine(move: StudyMove, named: NamedMove): StudyMove | undefined {
  return nearestMatch(lineThrough(move), named, move.ply);
}

/** Of `moves`, the one `named` names, nearest the ply its number gives (else `ply`). */
export function nearestMatch(moves: Iterable<StudyMove>, named: NamedMove, ply: number): StudyMove | undefined {
  const matches = [...moves].filter(
    (candidate) => candidate.san === named.san && (!named.side || candidate.before.turn === named.side),
  );
  return nearest(matches, named.ply ?? ply, (candidate) => candidate.ply);
}

/** Where `moves` can be played in a row on the line through `move`, as a spot and its moves in UCI. */
export function placeSequence(move: StudyMove, moves: readonly NamedMove[]): { spot: Spot; ucis: Uci[] } | undefined {
  if (moves.length === 0) return undefined;
  const line = lineThrough(move);
  const spots: Spot[] = [{ pos: line[0].before }, ...line.map((at) => ({ move: at, pos: at.after }))];
  const fits = spots.flatMap((spot) => {
    const ucis = playable(spot.pos, moves);
    return ucis ? [{ spot, ucis }] : [];
  });
  const firstPly = moves[0].ply ?? move.ply + 1;
  return nearest(fits, firstPly, ({ spot }) => (spot.move?.ply ?? 0) + 1);
}

/** `moves` in UCI if they can be played one after another from `pos`. */
function playable(pos: Chess, moves: readonly NamedMove[]): Uci[] | undefined {
  const ucis: Uci[] = [];
  let board = pos;
  for (const named of moves) {
    const uci = board.turn === (named.side ?? board.turn) ? sanToUci(board, named.san) : undefined;
    if (!uci) return undefined;
    ucis.push(uci);
    board = played(board, uci);
  }
  return ucis;
}

/** The moves `side` played on the way to `spot`. */
export function playedBy(spot: Spot, side: Color): Set<string> {
  const sans = new Set<string>();
  for (let at = spot.move; at; at = at.parent) {
    if (at.before.turn === side) sans.add(at.san);
  }
  return sans;
}

function nearest<T>(items: readonly T[], target: number, ply: (item: T) => number): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    if (best === undefined || Math.abs(ply(item) - target) < Math.abs(ply(best) - target)) best = item;
  }
  return best;
}
