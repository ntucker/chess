/**
 * The floors and caps the finder walks by, in one place, so the report
 * (piece B of docs/plans/opportunities.md) can tune them.
 */
import { MISTAKE_LOSS } from '@/analysis/quality';

export interface Limits {
  /** A reply played under this share of the position's games is not screened. */
  readonly shareFloor: number;
  /** A position fewer games reach is too thin to judge (`repliesFrom`, the lichess host's). */
  readonly minGames: number;
  /** The least expected score (0 to 1) a reply must give away to be a mistake. */
  readonly costFloor: number;
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
}

export const LIMITS: Limits = {
  shareFloor: 0.05,
  minGames: 100,
  // The mistake limit, so every opportunity's first move labels as a mistake or a blunder.
  costFloor: MISTAKE_LOSS,
  reachFloor: 0.01,
  maxPlies: 24,
  // About 3.8 pawns on lichess's curve (`evaluationFromScore` in src/stockfish/uci.ts).
  winScore: 0.8,
  materialUp: 3,
  payoffMoves: 6,
};
