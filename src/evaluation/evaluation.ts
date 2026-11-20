import type { GameResult } from '@/game/replay';

/** How a position stands, from White's side. */
export interface Evaluation {
  /** White's expected score: 0 if Black wins, 0.5 if even, 1 if White wins. */
  readonly score: number;
  /** White's advantage in pawns, negative when Black is ahead. */
  readonly pawns: number;
  /**
   * Moves until mate when the engine sees one: positive when White mates,
   * negative when Black does, 0 when the side to move is already mated.
   */
  readonly mate?: number;
  /** The move the engine would play here (UCI), when it names one; Maia's value head doesn't. */
  readonly best?: string;
}

/** One of the engine's top moves in a position (UCI), and how the position stands after it. */
export interface TopMove {
  readonly uci: string;
  readonly evaluation: Evaluation;
}

/**
 * The size of an advantage of `pawns`, as the evaluation bar and engine lines
 * write it: tenths of a pawn below 10, whole pawns from there up to 99.
 */
export function pawnsLabel(pawns: number): string {
  const tenths = Math.round(Math.abs(pawns) * 10) / 10;
  return tenths < 10 ? tenths.toFixed(1) : String(Math.min(99, Math.round(tenths)));
}

/** `evaluation` as an engine line writes it, from White's side: "+0.7", "\u22121.2", "0.0" or "+M3". */
export function signedEvaluation({ score, pawns, mate }: Evaluation): string {
  // A side already mated (mate 0) has only the score to say who won.
  if (mate !== undefined) return `${score < 0.5 ? '\u2212' : '+'}M${Math.abs(mate)}`;
  const label = pawnsLabel(pawns);
  return Number(label) === 0 ? label : `${pawns < 0 ? '\u2212' : '+'}${label}`;
}

/** How a finished game stands: the winner scores 1, a draw 0.5 each. */
export function resultEvaluation({ winner }: GameResult): Evaluation {
  return { score: winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5, pawns: 0 };
}

/** The engines that can judge positions for the evaluation bar. */
export const EVALUATION_ENGINES = ['stockfish', 'maia'] as const;

export type EvaluationEngine = (typeof EVALUATION_ENGINES)[number];
