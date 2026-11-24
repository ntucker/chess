/**
 * Act III of an opportunity: play on after the cue until the win is obvious.
 */
import { forSide, isFinal, scoreFor } from '@/evaluation/evaluation';
import { balance } from '@/game/material';
import type { Uci } from '@/lesson/lesson';

import { child, type Context, gamesIn, type MoveCounts, type Node } from './walk';

/**
 * The moves from `start` (the position after the cue's best reply) until the
 * win is obvious, or undefined while an answer is missing. The punishing
 * side plays Stockfish's best; the erring side its most played reply, or
 * Stockfish's best where too few games reach the position. It ends at mate
 * (a mating line plays out), when the punishing side is `materialUp` points
 * ahead and winning, when its second-best move is winning too, after
 * `payoffMoves` of its moves, or when the game ends.
 */
export function payoff(start: Node, { side, answers, limits, ask }: Context): Uci[] | undefined {
  const moves: Uci[] = [];
  let punishingMoves = 0;
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
      const mating = forSide(best.evaluation.mate ?? 0, side) > 0;
      const won =
        !mating &&
        winning(best) &&
        (winning(second) || balance(node.pos.board, side) >= limits.materialUp);
      if (won) break;
      uci = best.uci;
      punishingMoves++;
    } else {
      const counts = answers.replies(node);
      if (!counts) {
        ask('replies', node);
        return undefined;
      }
      uci = mostPlayed(counts, limits.minGames);
      if (!uci) {
        const final = full();
        if (!final) return undefined;
        uci = final.lines[0].uci;
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

/** The most played move in `counts`, if at least `minGames` games reach the position. */
function mostPlayed(counts: MoveCounts, minGames: number): Uci | undefined {
  if (gamesIn(counts) < minGames) return undefined;
  return Object.entries(counts).reduce((most, entry) => (entry[1] > most[1] ? entry : most))[0];
}
