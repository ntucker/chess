import { type Color, colorName, type GameResult } from '@/game/replay';

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
}

/** One of the moves an engine ranks in a position (UCI), and how the position stands after it. */
export interface AnalysisLine {
  /** The move; absent where the engine names none (Maia's value head, a finished game). */
  readonly uci?: string;
  readonly evaluation: Evaluation;
}

/**
 * How an engine judges a position: its best moves, best first, from one
 * search. The first line is the position's evaluation, and its move the
 * engine's best. Stockfish ranks three (fewer when fewer moves are legal),
 * all from one depth; Maia and a finished game have one line and no move.
 */
export interface Analysis {
  readonly lines: readonly AnalysisLine[];
  /** How many moves deep the search looked; 0 for Maia and a finished game. */
  readonly depth: number;
  /**
   * The search is done, so this never changes. Until then the lines are the
   * deepest it has finished so far.
   */
  readonly final: boolean;
}

/**
 * An analysis whose search is done, so it never changes: the only kind move
 * labels and the opponent read, so every screen and visit order agrees.
 */
export type FinalAnalysis = Analysis & { readonly final: true };

export const isFinal = (analysis: Analysis | undefined): analysis is FinalAnalysis =>
  !!analysis?.final;

/**
 * A final analysis of one line: how the position stands (`evaluation`), and
 * the move it names, if any. Maia and a finished game name none.
 */
export const settledAnalysis = (evaluation: Evaluation, uci?: string): FinalAnalysis => ({
  lines: [{ evaluation, ...(uci && { uci }) }],
  depth: 0,
  final: true,
});

/** Who wants a position's analysis: told each deeper depth, then the final one. */
export interface Watcher {
  /** The deepest lines so far, or the final ones (`final`), after which nothing more comes. */
  update(analysis: Analysis): void;
  /** The analysis can't finish: engines crashed on it, or a search ended without a score. */
  fail(error: Error): void;
}

/**
 * The final analysis a watch (`watch`, which tells its watcher as
 * `Stockfish.watch` does) ends with. Nothing comes after it, so the watch
 * isn't stopped: one nobody waits for any more still runs to the end.
 */
export function finalAnalysis(watch: (watcher: Watcher) => unknown): Promise<FinalAnalysis> {
  return new Promise((resolve, reject) => {
    watch({
      update(analysis) {
        if (isFinal(analysis)) resolve(analysis);
      },
      fail: reject,
    });
  });
}

/**
 * `side`'s expected score (0 to 1) in a position scored `evaluation`, which
 * is White's. Not for a difference of two scores near a limit: `1 - score`
 * rounds, so move labels negate instead (`signed` in src/analysis/quality.ts).
 */
export const scoreFor = ({ score }: Evaluation, side: Color) =>
  side === 'white' ? score : 1 - score;

/**
 * The size of an advantage of `pawns`, as the evaluation bar and engine lines
 * write it: tenths of a pawn below 10, whole pawns from there up to 99.
 */
export function pawnsLabel(pawns: number): string {
  const tenths = Math.round(Math.abs(pawns) * 10) / 10;
  return tenths < 10 ? tenths.toFixed(1) : String(Math.min(99, Math.round(tenths)));
}

/**
 * The side ahead: by the score for a mate, since a side already mated has
 * `mate` 0; otherwise by the pawns.
 */
function evaluationLeader({ score, pawns, mate }: Evaluation): Color {
  if (mate !== undefined) return score < 0.5 ? 'black' : 'white';
  return pawns < 0 ? 'black' : 'white';
}

/** How an evaluation or a result reads on the evaluation bar. */
export interface Reading {
  /** White's share of the bar, from 0 to 1. */
  readonly score: number;
  readonly label: string;
  /** The side whose end shows the label. */
  readonly leader: Color;
  readonly description: string;
}

/** How `evaluation` reads on the bar: its label, the side that leads, and in words. */
export function evaluationReading({ score, pawns, mate }: Evaluation): Reading {
  const leader = evaluationLeader({ score, pawns, mate });
  if (mate !== undefined) {
    const moves = Math.abs(mate);
    return {
      score,
      label: `M${moves}`,
      leader,
      description: `${colorName(leader)} mates in ${moves} ${moves === 1 ? 'move' : 'moves'}`,
    };
  }
  const label = pawnsLabel(pawns);
  if (Number(label) === 0) return { score, label, leader: 'white', description: 'Even' };
  return { score, label, leader, description: `${colorName(leader)} is ahead by ${label} pawns` };
}

/** `evaluation` as an engine line writes it, from White's side: "+0.7", "\u22121.2", "0.0" or "+M3". */
export function signedEvaluation(evaluation: Evaluation): string {
  const { pawns, mate } = evaluation;
  const label = mate === undefined ? pawnsLabel(pawns) : `M${Math.abs(mate)}`;
  if (Number(label) === 0) return label;
  return `${evaluationLeader(evaluation) === 'black' ? '\u2212' : '+'}${label}`;
}

/** How a finished game stands: the winner scores 1, a draw 0.5 each. */
export function resultEvaluation({ winner }: GameResult): Evaluation {
  return { score: winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5, pawns: 0 };
}

/** The engines that can judge positions for the evaluation bar. */
export const EVALUATION_ENGINES = ['stockfish', 'maia'] as const;

export type EvaluationEngine = (typeof EVALUATION_ENGINES)[number];
