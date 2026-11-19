import type { Evaluation } from '@/evaluation/evaluation';

import { bestMove, evaluation, prepareInput } from './maia';
import type { MaiaRating } from './ratings';
import { runNetwork } from './runNetwork';

// The rules run here; the network runs off the main thread, so the app keeps
// responding meanwhile.

/**
 * Maia's move after `line` (UCI moves from the starting position), in UCI
 * with castling as the king taking its rook (`e1h1`).
 */
export async function maiaMove(rating: MaiaRating, line: readonly string[]): Promise<string> {
  const { pos, planes } = prepareInput(line);
  return bestMove(pos, (await runNetwork(rating, planes)).policy);
}

/** How the position after `line` stands, as Maia judges it. */
export async function maiaEvaluation(
  rating: MaiaRating,
  line: readonly string[],
): Promise<Evaluation> {
  const { pos, planes } = prepareInput(line);
  const { wdl } = await runNetwork(rating, planes);
  if (!wdl) throw new Error(`Maia ${rating} has no value head to judge positions with`);
  return evaluation(pos, wdl);
}
