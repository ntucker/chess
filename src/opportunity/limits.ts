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
}

export const LIMITS: Limits = {
  // The share under which the list calls a reply rare.
  shareFloor: RARE_SHARE,
  reachFloor: 0.01,
  maxPlies: 24,
  // About 3.8 pawns on lichess's curve (`evaluationFromScore` in src/stockfish/uci.ts).
  winScore: 0.8,
  materialUp: 3,
  payoffMoves: 6,
  // Clearly better, short of winning.
  keepScore: 0.6,
  estimateCoverage: 0.5,
};
