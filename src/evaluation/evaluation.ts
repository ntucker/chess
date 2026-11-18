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

/** The engines that can judge positions for the evaluation bar. */
export const EVALUATION_ENGINES = ['stockfish', 'maia'] as const;

export type EvaluationEngine = (typeof EVALUATION_ENGINES)[number];
