/**
 * Act III of an opportunity: play on after the cue until the win is obvious.
 */
import { MISTAKE_LOSS } from '@/analysis/quality';
import {
  type Evaluation,
  type FinalAnalysis,
  forSide,
  isFinal,
  resultEvaluation,
  scoreFor,
} from '@/evaluation/evaluation';
import { balance } from '@/game/material';
import { gameResult } from '@/game/replay';
import type { Uci } from '@/lesson/lesson';

import { child, type Context, type Node, punishingLoss, type Replies } from './walk';

/** Act III: its moves, and the punishing side's expected score (0 to 1) where it ends. */
export interface Payoff {
  readonly moves: readonly Uci[];
  /**
   * Where the game is over, its result (1 for the punishing side's mate, 0
   * for its opponent's, 0.5 for a draw); else the evaluation `judgement` gave
   * the punishing side's last move (`moveLoss`), or the best line of the
   * position where Act III stopped before moving.
   */
  readonly end: number;
}

/**
 * The moves from `start` (the position after the cue's best reply) until the
 * win is obvious, or undefined while an answer is missing. `before` and
 * `cue` are the final analyses of the positions before the mistake and at
 * the cue. The punishing side plays the guide's move where it gives back
 * less than the mistake limit, else Stockfish's best (`end` reads the move it
 * plays); the erring side the guide's move, else its most played reply, else
 * Stockfish's best where the position is thin. It ends at mate (a mating
 * line plays out), when the punishing side is `materialUp` points ahead and
 * winning, when its second-best move is winning too, after `payoffMoves` of
 * its moves, where after an erring-side guide move the punishment wins less
 * than the mistake limit beside `before` (the guide holds a better defence, and
 * Act III adds no move to beat it), or when the game ends.
 */
export function payoff(
  start: Node,
  { before, cue }: { before: FinalAnalysis; cue: FinalAnalysis },
  context: Context,
): Payoff | undefined {
  const { side, limits } = context;
  const moves: Uci[] = [];
  let punishingMoves = 0;
  let guided = false;
  // Signed, not `scoreFor`: a difference near a limit must not round.
  const unpunished = forSide(before.lines[0].evaluation.score, side);
  let end = scoreFor(cue.lines[0].evaluation, side);
  let node = start;
  let over = gameOver(node);
  while (!over && punishingMoves < limits.payoffMoves) {
    let uci: Uci | undefined;
    if (node.pos.turn === side) {
      const final = fullAnalysis(node, context);
      if (!final) return undefined;
      const best = final.lines[0].evaluation;
      end = scoreFor(best, side);
      if (guided && forSide(best.score, side) - unpunished < MISTAKE_LOSS) break;
      if (obviouslyWon(node, final, context)) break;
      const move = punishingMove(node, final, context);
      if (move === 'pending') return undefined;
      uci = move.uci;
      end = scoreFor(move.evaluation, side);
      punishingMoves++;
    } else {
      const move = erringMove(node, context);
      if (!move) return undefined;
      ({ uci, guided } = move);
    }
    const next = uci === undefined ? undefined : child(node, uci, 0);
    if (!uci || !next) break;
    moves.push(uci);
    node = next;
    over = gameOver(node);
  }
  return { moves, end: over ? scoreFor(resultEvaluation(over), side) : end };
}

/**
 * How the game stands over at `node`, if it is: `gameResult`, since chessops'
 * `isEnd` misses the fifty-move rule. Act III reads the position alone, so a
 * repetition inside its few moves doesn't end it.
 */
const gameOver = (node: Node) => gameResult(node.pos, 1);

/** The final analysis of `node`, asking for it while it's missing. */
function fullAnalysis(node: Node, { answers, ask }: Context): FinalAnalysis | undefined {
  const analysis = answers.analysis(node);
  if (isFinal(analysis)) return analysis;
  ask('full', node);
  return undefined;
}

/**
 * Whether the punishing side's win at `node` is obvious: winning, with its
 * second-best move winning too or `materialUp` points ahead. A mating line
 * plays out instead. Like the review's `winning` (`src/review/refine.ts`), it
 * reads Stockfish's second line, at the finder's own `winScore`.
 */
function obviouslyWon(node: Node, final: FinalAnalysis, { side, limits }: Context): boolean {
  const [best, second] = final.lines;
  const winning = (line: typeof best | undefined) =>
    !!line && scoreFor(line.evaluation, side) >= limits.winScore;
  const mating = forSide(best.evaluation.mate ?? 0, side) > 0;
  return (
    !mating &&
    winning(best) &&
    (winning(second) || balance(node.pos.board, side) >= limits.materialUp)
  );
}

/**
 * The erring side's move at `node`, and whether the guide gave it: the
 * guide's, else its most played reply, else Stockfish's best where the
 * position is thin; undefined while an answer is missing.
 */
function erringMove(node: Node, context: Context): { uci: Uci; guided: boolean } | undefined {
  const { answers, ask } = context;
  const guide = answers.guideMoves?.(node)?.[0];
  if (guide !== undefined) return { uci: guide, guided: true };
  const replies = answers.replies(node);
  if (!replies) {
    ask('replies', node);
    return undefined;
  }
  const uci = mostPlayed(replies) ?? fullAnalysis(node, context)?.lines[0].uci;
  return uci === undefined ? undefined : { uci, guided: false };
}

/**
 * The punishing side's move at `node`, with the evaluation it leads to: the
 * guide's where it has one that gives back less than the mistake limit beside
 * Stockfish's best (so the tree stays the one source for the line), else
 * Stockfish's best; `'pending'` while the guide's move awaits its full search.
 */
function punishingMove(
  node: Node,
  final: FinalAnalysis,
  context: Context,
): { uci?: Uci; evaluation: Evaluation } | 'pending' {
  const best = final.lines[0];
  const guide = context.answers.guideMoves?.(node)?.[0];
  if (!guide || guide === best.uci) return best;
  const judged = punishingLoss(node, final, guide, context);
  if (judged === 'pending') return judged;
  return judged && judged.loss < MISTAKE_LOSS
    ? { uci: guide, evaluation: judged.evaluation }
    : best;
}

/** The most played move; undefined where the position is thin or no move was played. */
function mostPlayed({ shares, thin }: Replies): Uci | undefined {
  if (thin) return undefined;
  let most: [Uci, number] | undefined;
  for (const entry of Object.entries(shares)) {
    if (!most || entry[1] > most[1]) most = entry;
  }
  return most?.[0];
}
