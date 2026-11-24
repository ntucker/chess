/**
 * What the finder's walk is made of: the positions it reaches, the answers
 * it reads about them, and the answers it asks for.
 */
import type { Chess } from 'chessops/chess';

import type { Analysis } from '@/evaluation/evaluation';
import { type Color, parsePosition, playMove, positionKey } from '@/game/replay';
import type { PositionKey, Uci } from '@/lesson/lesson';
import { SKETCH_DEPTH } from '@/review/order';

import type { Limits } from './limits';

/** Games per move in one position, in the band the host answers for; a move missing was not played. */
export type MoveCounts = Readonly<Record<Uci, number>>;

/** A position the finder asks about: the line from the start that reaches it, and its key. */
export interface Spot {
  readonly line: readonly Uci[];
  readonly key: PositionKey;
}

/** What the host knows so far. Each lookup is undefined until the host has the answer. */
export interface Answers {
  /** Games per move played at the position (one source and band for the whole run). */
  replies(spot: Spot): MoveCounts | undefined;
  /** Stockfish's analysis of the position: the deepest the host has, final or not. */
  analysis(spot: Spot): Analysis | undefined;
  /**
   * The punishing side's own moves here (a lesson's book moves), where the host
   * has some; elsewhere the finder plays Stockfish's best.
   */
  ownMoves?(spot: Spot): readonly Uci[] | undefined;
}

/**
 * An answer the finder needs: a position's replies, a sketch (a search that
 * reached `SKETCH_DEPTH`) or a full search (a final analysis).
 */
export interface Request {
  readonly kind: 'replies' | 'sketch' | 'full';
  readonly spot: Spot;
}

/** A position the walk reached, and the share of games that reach it. */
export interface Node extends Spot {
  readonly pos: Chess;
  readonly reach: number;
}

/** What every step of the walk reads, and how it asks for a missing answer. */
export interface Context {
  /** The side looking for opportunities: the one that punishes. */
  readonly side: Color;
  readonly answers: Answers;
  readonly limits: Limits;
  readonly ask: (kind: Request['kind'], spot: Spot) => void;
}

/** The node `uci` leads to from `node`, with `reach`; undefined if it isn't legal. */
export function child(node: Node, uci: Uci, reach: number): Node | undefined {
  const pos = node.pos.clone();
  if (!playMove(pos, uci)) return undefined;
  return { pos, key: positionKey(pos), line: [...node.line, uci], reach };
}

/** The node `line` reaches from the FEN `start`, with reach 1; undefined if a move isn't legal. */
export function walkTo(start: string, line: readonly Uci[]): Node | undefined {
  const pos = parsePosition(start);
  let node: Node | undefined = pos && { pos, key: positionKey(pos), line: [], reach: 1 };
  for (const uci of line) node = node && child(node, uci, 1);
  return node;
}

/** Whether `analysis` is at least a sketch. */
export const sketched = (analysis: Analysis | undefined): analysis is Analysis =>
  !!analysis && (analysis.final || analysis.depth >= SKETCH_DEPTH);

/** The games in `counts`, or only those of `moves`. */
export const gamesIn = (counts: MoveCounts, moves: readonly Uci[] = Object.keys(counts)) =>
  moves.reduce((sum, uci) => sum + (counts[uci] ?? 0), 0);
