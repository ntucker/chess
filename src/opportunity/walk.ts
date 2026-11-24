/**
 * What the finder's walk is made of: the positions it reaches, the answers
 * it reads about them, and the answers it asks for.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import type { Analysis } from '@/evaluation/evaluation';
import { type Color, parsePosition, positionKey } from '@/game/replay';
import type { PositionKey, Uci } from '@/lesson/lesson';

import type { Limits } from './limits';

/** Games per move in one position, in the band the host answers for; a move missing was not played. */
export type MoveCounts = Readonly<Record<Uci, number>>;

/**
 * A position's replies as the run's one source gives them: each move's share
 * of the games there (0 to 1; a move missing was not played), and whether too
 * few games reach the position to judge it. The walk ends at a thin position.
 */
export interface Replies {
  readonly shares: Readonly<Record<Uci, number>>;
  readonly thin: boolean;
}

/** A position the finder asks about: the line from the start that reaches it, and its key. */
export interface Spot {
  readonly line: readonly Uci[];
  readonly key: PositionKey;
}

/** What the host knows so far. Each lookup is undefined until the host has the answer. */
export interface Answers {
  /** The replies played at the position (one source and band for the whole run). */
  replies(spot: Spot): Replies | undefined;
  /** Stockfish's analysis of the position: the deepest the host has, final or not. */
  analysis(spot: Spot): Analysis | undefined;
  /**
   * A lesson's moves here, most played first (its book moves at its own side's
   * turn, every move at the other's), where the host has some. The finder
   * follows them for the punishing side, and Act III plays the first for the
   * erring side; elsewhere they come from Stockfish or the replies.
   */
  guideMoves?(spot: Spot): readonly Uci[] | undefined;
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
  const move = parseUci(uci);
  if (!move || !node.pos.isLegal(move)) return undefined;
  const pos = node.pos.clone();
  pos.play(move);
  return { pos, key: positionKey(pos), line: [...node.line, uci], reach };
}

/** The node `line` reaches from the FEN `start`, with reach 1; undefined if a move isn't legal. */
export function walkTo(start: string, line: readonly Uci[]): Node | undefined {
  const pos = parsePosition(start);
  let node: Node | undefined = pos && { pos, key: positionKey(pos), line: [], reach: 1 };
  for (const uci of line) node = node && child(node, uci, 1);
  return node;
}

/**
 * Lichess's `counts` as replies: each move's games over `total`, the games
 * reaching the position, and thin when fewer than `minGames` do.
 */
export function repliesFrom(
  counts: MoveCounts,
  minGames: number,
  total = Object.values(counts).reduce((sum, games) => sum + games, 0),
): Replies {
  return {
    shares: Object.fromEntries(
      Object.entries(counts).map(([uci, games]) => [uci, total && games / total]),
    ),
    thin: total < minGames,
  };
}
