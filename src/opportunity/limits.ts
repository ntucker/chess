/**
 * The floors and caps the finder walks by, in one place, so the report
 * (piece B of docs/plans/opportunities.md) can tune them. The cost floor is
 * not one of them: a mistake is a reply over `MISTAKE_LOSS`, the limit the
 * app labels by, so every opportunity's first move labels as a mistake or a
 * blunder.
 */
import { RARE_SHARE } from '@/lesson/select';

/** A position fewer games reach is too thin to judge: the lichess host's `repliesFrom`. */
export const MIN_GAMES = 100;

export interface Limits {
  /** A reply played under this share of the position's games is not screened. */
  readonly shareFloor: number;
  /** The walk goes no further than positions at least this share of games reach. */
  readonly reachFloor: number;
  /** The walk goes at most this many plies past where the finder opens. */
  readonly maxPlies: number;
  /** An expected score (0 to 1) at or above this is winning. */
  readonly winScore: number;
  /** Act III may end once the punishing side is this many points of material up, and winning. */
  readonly materialUp: number;
  /** Act III ends after at most this many of the punishing side's moves. */
  readonly payoffMoves: number;
  /** A find is kept where Act III ends with the punishing side's expected score at least this. */
  readonly keepScore: number;
  /** A gain is an estimate where the replies it measures cover under this share of the cue's games. */
  readonly estimateCoverage: number;
  /**
   * A mistake whose gain (expected score per game at the cue, `gainIfKnown`)
   * is under this is no find, unless the gain is an estimate: nearly everyone
   * finds its punishment, so knowing it is worth nothing.
   */
  readonly minGain: number;
}

export const LIMITS: Limits = {
  // The share under which the list calls a reply rare.
  shareFloor: RARE_SHARE,
  // Reach counts from the first move over every game, so a lesson's share
  // shrinks it: the whole Stafford is about 13% of 1.e4 e5 games. At 0.01 the
  // Stafford walk missed 8.Ke1 Qh4+ and 7.g3 Nxg3, both on its guide.
  reachFloor: 0.005,
  maxPlies: 24,
  // About 3.8 pawns on lichess's curve (`evaluationFromScore` in src/stockfish/uci.ts).
  winScore: 0.8,
  materialUp: 3,
  payoffMoves: 6,
  // Clearly better, short of winning.
  keepScore: 0.6,
  estimateCoverage: 0.5,
  // Only the recaptures nearly everyone finds (gain 0 in the Stafford; the
  // next gain up is 0.03). Not 0.05, the inaccuracy limit: gain measures only
  // the reply at the cue, so a trap whose hard move comes later gains little
  // there yet is real (6.Bc4 Bc5 7.O-O Nxf2 in the Stafford gains 0.04).
  minGain: 0.01,
};
