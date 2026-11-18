import { bestMove, prepareMove } from './maia';
import type { MaiaRating } from './models';
import { runNetwork } from './runNetwork';

/**
 * Maia's move after `line` (UCI moves from the starting position), in UCI
 * with castling as the king taking its rook (`e1h1`). The rules run here; the
 * network runs off the main thread, so the app keeps responding meanwhile.
 */
export async function maiaMove(rating: MaiaRating, line: readonly string[]): Promise<string> {
  const { pos, planes } = prepareMove(line);
  return bestMove(pos, await runNetwork(rating, planes));
}
