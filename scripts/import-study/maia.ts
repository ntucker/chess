/**
 * Maia in Node, for the opportunities report's Maia runs (./finderHost.ts):
 * the network the app ships, run on this thread, since a run asks one
 * position at a time and each answer takes a few milliseconds.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Uci } from '@/lesson/lesson';
import { moveShares, prepareInput } from '@/maia/maia';
import { forward, parseNetwork } from '@/maia/network';
import type { MaiaRating } from '@/maia/ratings';

const ROOT = join(__dirname, '../..');

/** Maia `rating`'s shares (`moveShares`) after a line of UCI moves from the starting position. */
export function nodeMaiaShares(rating: MaiaRating): (line: readonly Uci[]) => Record<Uci, number> {
  const network = parseNetwork(readFileSync(join(ROOT, `assets/maia/maia-${rating}.bin`)));
  return (line) => {
    const { pos, planes } = prepareInput(line);
    return moveShares(pos, forward(network, planes).policy);
  };
}
