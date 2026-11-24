/**
 * What knowing a cue is worth: how much more the punishing side keeps by
 * playing the best reply than by playing as its band does.
 */
import type { Uci } from '@/lesson/lesson';

export interface Gain {
  /** Expected score (0 to 1) per game at the cue, over the replies measured. */
  readonly gain: number;
  /** The share of the cue's games the measured replies cover. */
  readonly covered: number;
}

/**
 * The share-weighted loss of the band's replies at the cue beside the best,
 * over the replies with a measured loss (`losses`, from `judgement`'s rule);
 * the rest are left out and the measured ones renormalised. 0 where none is
 * measured.
 */
export function gainIfKnown(
  shares: Readonly<Record<Uci, number>>,
  losses: Readonly<Record<Uci, number>>,
): Gain {
  let covered = 0;
  let lost = 0;
  for (const [uci, loss] of Object.entries(losses)) {
    const share = shares[uci] ?? 0;
    covered += share;
    lost += share * loss;
  }
  return { gain: covered && lost / covered, covered };
}
