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
 * rounds, so move labels negate instead (`forSide`).
 */
export const scoreFor = ({ score }: Evaluation, side: Color) =>
  side === 'white' ? score : 1 - score;

/**
 * An amount on White's side (a score, or a difference in pawns) for `side`:
 * higher is better for it.
 */
export const forSide = (amount: number, side: Color) => (side === 'white' ? amount : -amount);

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
    return {
      score,
      label: mateLabel(mate),
      leader,
      description: `${colorName(leader)} mates in ${moveCount(mate)}`,
    };
  }
  const label = pawnsLabel(pawns);
  if (Number(label) === 0) return { score, label, leader: 'white', description: 'Even' };
  return { score, label, leader, description: `${colorName(leader)} is ahead by ${label} pawns` };
}

/** How a move changes the position for one side, as a list of moves writes it. */
export interface MoveChange {
  /** "+0.4" when better for the side, "\u22121.2" when worse, "0.0", or a mate: "+M3". */
  readonly label: string;
  readonly description: string;
}

/**
 * How a move from a position scored `before` to one scored `after` changes
 * it for `side` ("you"): the pawns it gains or loses, so a move keeping the
 * position as it stands (an engine's best) reads "0.0". Example: for Black,
 * a move from +0.3 to \u22120.1 reads "+0.4". A move that changes a forced
 * mate reads as `mateChange` says.
 */
export function moveChange(before: Evaluation, after: Evaluation, side: Color): MoveChange {
  // The mate a changed mate names; checked too so its type is a number.
  const mate = after.mate ?? before.mate;
  if (mate !== undefined && after.mate !== before.mate) {
    return mateChange(before, after, mate, side);
  }
  const gain = forSide(after.pawns - before.pawns, side);
  const label = pawnsLabel(gain);
  if (Number(label) === 0) return { label, description: 'No change' };
  const better = gain > 0;
  return {
    label: withSign(label, better),
    description: `${label} pawns ${better ? 'better' : 'worse'} for you`,
  };
}

/**
 * A move into, out of or between forced mates, which pawns can't count. The
 * sign still says better or worse for `side`, and the label names `mate`:
 * the one the move leads to, or else the one it ends. Example: for Black, a
 * move that lets White mate in 2 reads "\u2212M2", and when Black mates in
 * 3, a move that mates in 5 instead reads "\u2212M5".
 */
function mateChange(before: Evaluation, after: Evaluation, mate: number, side: Color): MoveChange {
  const better = mateRank(after, side) > mateRank(before, side);
  const label = withSign(mateLabel(mate), better);
  const moves = moveCount(mate);
  if (after.mate === undefined) {
    return { label, description: `Ends ${better ? "your opponent's" : 'your'} mate in ${moves}` };
  }
  const mating = evaluationLeader(after) === side;
  return { label, description: `${mating ? 'You mate' : 'Your opponent mates'} in ${moves}` };
}

/** More moves than any mate an engine reports, so every mate ranks away from none. */
const LONGEST_MATE = 1000;

/**
 * How good a position's mate is for `side`, to compare two: its own mate
 * beats none, the sooner the better, and the opponent's is worse than none,
 * the sooner the worse.
 */
function mateRank(evaluation: Evaluation, side: Color): number {
  if (evaluation.mate === undefined) return 0;
  const urgency = LONGEST_MATE - Math.abs(evaluation.mate);
  return evaluationLeader(evaluation) === side ? urgency : -urgency;
}

const withSign = (label: string, plus: boolean) => `${plus ? '+' : '\u2212'}${label}`;

/** A mate's label, without its side: "M3". */
const mateLabel = (mate: number) => `M${Math.abs(mate)}`;

/** How many moves until `mate`, in words: "3 moves". */
const moveCount = (mate: number) => {
  const moves = Math.abs(mate);
  return `${moves} ${moves === 1 ? 'move' : 'moves'}`;
};

/** How a finished game stands: the winner scores 1, a draw 0.5 each. */
export function resultEvaluation({ winner }: GameResult): Evaluation {
  return { score: winner === 'white' ? 1 : winner === 'black' ? 0 : 0.5, pawns: 0 };
}

/** The engines that can judge positions for the evaluation bar. */
export const EVALUATION_ENGINES = ['stockfish', 'maia'] as const;

export type EvaluationEngine = (typeof EVALUATION_ENGINES)[number];
