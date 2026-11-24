/**
 * Act III of an opportunity: play on after the cue until the win is obvious.
 */
import { type FinalAnalysis, forSide, isFinal, scoreFor } from '@/evaluation/evaluation';
import { balance } from '@/game/material';
import type { Uci } from '@/lesson/lesson';

import { child, type Context, type Node, punishingLoss, type Replies } from './walk';

/** Act III: its moves, and the punishing side's expected score (0 to 1) where it ends. */
export interface Payoff {
  readonly moves: readonly Uci[];
  /** 1 where it ends in mate; else from the last analysis of the punishing side's position. */
  readonly end: number;
}

/**
 * The moves from `start` (the position after the cue's best reply) until the
 * win is obvious, or undefined while an answer is missing. `before` and `cue`
 * are the final analyses of the positions before the mistake and at the cue.
 * The punishing side plays the guide's move where it gives back less than the
 * cost floor, else Stockfish's best; the erring side the guide's move, else
 * its most played reply, else Stockfish's best where the position is thin. It
 * ends at mate (a mating line plays out), when the punishing side is
 * `materialUp` points ahead and winning, when its second-best move is winning
 * too, after `payoffMoves` of its moves, where after an erring-side guide move
 * the punishment wins less than the cost floor beside `before` (the guide
 * holds a better defence, and Act III adds no move to beat it), or when the
 * game ends.
 */
export function payoff(
  start: Node,
  { before, cue }: { before: FinalAnalysis; cue: FinalAnalysis },
  context: Context,
): Payoff | undefined {
  const { side, answers, limits, ask } = context;
  const moves: Uci[] = [];
  let punishingMoves = 0;
  let guided = false;
  // Signed, not `scoreFor`: a difference near a limit must not round.
  const unpunished = forSide(before.lines[0].evaluation.score, side);
  let end = scoreFor(cue.lines[0].evaluation, side);
  let node = start;
  while (!node.pos.isEnd()) {
    const analysis = answers.analysis(node);
    const full = () => (isFinal(analysis) ? analysis : void ask('full', node));
    let uci: Uci | undefined;
    if (node.pos.turn === side) {
      const final = full();
      if (!final) return undefined;
      const [best, second] = final.lines;
      // As the review's `winning` (`src/review/refine.ts`) reads Stockfish's
      // second line, at the finder's own `winScore`.
      const winning = (line: typeof best | undefined) =>
        !!line && scoreFor(line.evaluation, side) >= limits.winScore;
      end = scoreFor(best.evaluation, side);
      const stillWon = forSide(best.evaluation.score, side) - unpunished;
      if (guided && stillWon < limits.costFloor) break;
      const mating = forSide(best.evaluation.mate ?? 0, side) > 0;
      const won =
        !mating &&
        winning(best) &&
        (winning(second) || balance(node.pos.board, side) >= limits.materialUp);
      if (won) break;
      const move = punishingMove(node, final, context);
      if (move === 'pending') return undefined;
      uci = move;
      punishingMoves++;
    } else {
      uci = answers.guideMoves?.(node)?.[0];
      guided = uci !== undefined;
      if (!guided) {
        const replies = answers.replies(node);
        if (!replies) {
          ask('replies', node);
          return undefined;
        }
        uci = mostPlayed(replies) ?? full()?.lines[0].uci;
        if (!uci) return undefined;
      }
    }
    const next = uci === undefined ? undefined : child(node, uci, 0);
    if (!next) break;
    moves.push(next.line.at(-1)!);
    const punished = node.pos.turn === side;
    node = next;
    if (punished && punishingMoves === limits.payoffMoves) break;
  }
  return { moves, end: node.pos.isCheckmate() && node.pos.turn !== side ? 1 : end };
}

/**
 * The punishing side's move at `node`: the guide's where it has one that
 * gives back less than the cost floor beside Stockfish's best (so the tree
 * stays the one source for the line), else Stockfish's best; `'pending'`
 * while the guide's move awaits its full search.
 */
function punishingMove(
  node: Node,
  final: FinalAnalysis,
  context: Context,
): Uci | undefined | 'pending' {
  const best = final.lines[0].uci;
  const guide = context.answers.guideMoves?.(node)?.[0];
  if (!guide || guide === best) return best;
  const loss = punishingLoss(node, final, guide, context);
  if (loss === 'pending') return loss;
  return loss !== undefined && loss < context.limits.costFloor ? guide : best;
}

/** The most played move, unless the position is thin. */
function mostPlayed({ shares, thin }: Replies): Uci | undefined {
  if (thin) return undefined;
  return Object.entries(shares).reduce((most, entry) => (entry[1] > most[1] ? entry : most))[0];
}
