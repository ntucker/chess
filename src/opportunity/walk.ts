/**
 * What the finder's walk is made of: the positions it reaches, the answers
 * it reads about them, and the answers it asks for.
 */
import type { Chess } from 'chessops/chess';
import { parseUci } from 'chessops/util';

import { type MoveLoss, moveLoss } from '@/analysis/quality';
import { type Analysis, type FinalAnalysis, isFinal } from '@/evaluation/evaluation';
import { type Color, gameResult, parsePosition, positionKey } from '@/game/replay';
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
 * reached `SKETCH_DEPTH`, `src/evaluation/evaluation.ts`) or a full search (a final analysis).
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

/**
 * What the punishing side's `uci` at `node` gives away beside the best move
 * of `final`, its final analysis, and the evaluation that judges it
 * (`moveLoss`): undefined where it can't be judged, `'pending'` while a move
 * `final` doesn't list awaits its own full search.
 */
export function punishingLoss(
  node: Node,
  final: FinalAnalysis,
  uci: Uci,
  { side, answers, ask }: Context,
): MoveLoss | undefined | 'pending' {
  const listed = final.lines.some((line) => line.uci === uci);
  const next = listed ? undefined : child(node, uci, 0);
  const analysis = next && answers.analysis(next);
  if (next && !isFinal(analysis)) {
    ask('full', next);
    return 'pending';
  }
  return moveLoss(final, analysis, uci, side);
}

/**
 * The node `uci` leads to from `node`, with `reach`; undefined if it isn't
 * legal. Not `playMove` (`replay.ts`), which also writes the move's SAN that
 * the walk never reads.
 */
export function child(node: Node, uci: Uci, reach: number): Node | undefined {
  const move = parseUci(uci);
  if (!move || !node.pos.isLegal(move)) return undefined;
  const pos = node.pos.clone();
  pos.play(move);
  return { pos, key: positionKey(pos), line: [...node.line, uci], reach };
}

/**
 * The node a move the finder trusts leads to: the guide's (the lesson checker
 * rules out an illegal one), Stockfish's, or an explorer reply already checked.
 * Throws where it isn't legal, since the data that gave it is broken.
 */
export function legalChild(node: Node, uci: Uci, reach: number): Node {
  const next = child(node, uci, reach);
  if (!next) throw illegalMoveError(node, uci);
  return next;
}

/** The error for a trusted move that isn't legal at `node`. */
export const illegalMoveError = (node: Spot, uci: Uci) =>
  new Error(`Move ${uci} is illegal in ${node.key}`);

/**
 * The game's result at `node`, if it is over: `gameResult`, since chessops'
 * `isEnd` misses the fifty-move rule. The finder counts each position as
 * seen once, so a repetition inside its few moves doesn't end a line.
 */
export const resultAt = (node: Node) => gameResult(node.pos, 1);

/** The node `line` reaches from the FEN `start`, with reach 1; undefined if a move isn't legal. */
export function walkTo(start: string, line: readonly Uci[]): Node | undefined {
  const pos = parsePosition(start);
  let node: Node | undefined = pos && { pos, key: positionKey(pos), line: [], reach: 1 };
  for (const uci of line) node = node && child(node, uci, 1);
  return node;
}

/**
 * Lichess's `counts` as replies: each move's games over the games reaching
 * the position, and thin when fewer than `minGames` do.
 */
export function repliesFrom(counts: MoveCounts, minGames: number): Replies {
  const total = Object.values(counts).reduce((sum, games) => sum + games, 0);
  return {
    shares: Object.fromEntries(
      Object.entries(counts).map(([uci, games]) => [uci, total && games / total]),
    ),
    thin: total < minGames,
  };
}
