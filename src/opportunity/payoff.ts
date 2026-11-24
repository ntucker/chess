/**
 * Act III of an opportunity: play on after the cue until the win is obvious.
 */
import { moveLoss } from '@/analysis/quality';
import { type FinalAnalysis, forSide, isFinal, scoreFor } from '@/evaluation/evaluation';
import { balance } from '@/game/material';
import type { Uci } from '@/lesson/lesson';

import { child, type Context, type Node, type Replies } from './walk';

/**
 * The moves from `start` (the position after the cue's best reply, which
 * gives the punishing side the `expected` score) until the win is obvious, or
 * undefined while an answer is missing. The punishing side plays the guide's
 * move where it gives back less than the cost floor, else Stockfish's best;
 * the erring side the guide's move, else its most played reply, else
 * Stockfish's best where the position is thin. It ends at mate (a mating line
 * plays out), when the punishing side is `materialUp` points ahead and
 * winning, when its second-best move is winning too, after `payoffMoves` of
 * its moves, where a guide move takes back at least the cost floor of its
 * expected score (the guide holds a better defence than its line, and Act III
 * adds no move to beat it), or when the game ends.
 */
export function payoff(start: Node, expected: number, context: Context): Uci[] | undefined {
  const { side, answers, limits, ask } = context;
  const moves: Uci[] = [];
  let punishingMoves = 0;
  let guided = false;
  let held = expected;
  for (let node = start; !node.pos.isEnd();) {
    const analysis = answers.analysis(node);
    const full = () => (isFinal(analysis) ? analysis : void ask('full', node));
    let uci: Uci | undefined;
    if (node.pos.turn === side) {
      const final = full();
      if (!final) return undefined;
      const [best, second] = final.lines;
      const winning = (line: typeof best | undefined) =>
        !!line && scoreFor(line.evaluation, side) >= limits.winScore;
      const score = scoreFor(best.evaluation, side);
      if (guided && held - score >= limits.costFloor) break;
      held = score;
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
    if (punishingMoves === limits.payoffMoves && node.pos.turn === side) break;
    node = next;
  }
  return moves;
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
  { side, answers, limits, ask }: Context,
): Uci | undefined | 'pending' {
  const best = final.lines[0].uci;
  const guide = answers.guideMoves?.(node)?.[0];
  if (!guide || guide === best) return best;
  const listed = final.lines.some((line) => line.uci === guide);
  const after = listed ? undefined : child(node, guide, 0);
  const analysis = after && answers.analysis(after);
  if (after && !isFinal(analysis)) {
    ask('full', after);
    return 'pending';
  }
  const loss = moveLoss(final, analysis, guide, side)?.loss;
  return loss !== undefined && loss < limits.costFloor ? guide : best;
}

/** The most played move, unless the position is thin. */
function mostPlayed({ shares, thin }: Replies): Uci | undefined {
  if (thin) return undefined;
  return Object.entries(shares).reduce((most, entry) => (entry[1] > most[1] ? entry : most))[0];
}
