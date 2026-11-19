import { useCache, useFetch } from '@data-client/react';

import { getEvaluation } from '@/resources/evaluation';
import { useSettings } from '@/settings/SettingsProvider';

import { classifyMove, type MoveQuality } from './quality';

/**
 * The label of move `n` of `moves` (counting from 1), from the evaluations of
 * the positions before and after it, as the chosen engine judges them;
 * none for `n` 0, or until both are known.
 *
 * Only the move the board shows should `ask` for its evaluations: a search
 * costs up to a second on a phone, and the engine runs the newest request
 * first. Other moves (the scoresheet's) read only what is already known,
 * which fills in as the board shows each move.
 *
 * ```ts
 * const quality = useMoveQuality(moves, ply, { ask: true });
 * ```
 */
export function useMoveQuality(
  moves: readonly string[],
  n: number,
  { ask }: { readonly ask: boolean },
): MoveQuality | undefined {
  const engine = useSettings().evaluationEngine;
  const previous = n ? ([engine, moves.slice(0, n - 1)] as const) : ([null] as const);
  const next = n ? ([engine, moves.slice(0, n)] as const) : ([null] as const);
  useFetch(getEvaluation, ...(ask ? previous : [null]));
  useFetch(getEvaluation, ...(ask ? next : [null]));
  const before = useCache(getEvaluation, ...previous);
  const after = useCache(getEvaluation, ...next);
  if (!before || !after) return undefined;
  // Every game starts from the starting position, so White plays the odd moves.
  return classifyMove({ before, after, uci: moves[n - 1], mover: n % 2 ? 'white' : 'black' });
}
