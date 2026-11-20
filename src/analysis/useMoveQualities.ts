import { StateContext, useController, useFetch } from '@data-client/react';
import { use } from 'react';

import type { EvaluationEngine } from '@/evaluation/evaluation';
import type { Ply } from '@/game/replay';
import { getEvaluation, getTopMoves } from '@/resources/evaluation';

import { classifyMove, judgedFromList, type MoveQuality } from './quality';

/**
 * Each move's label, from the evaluations of the positions before and after
 * it as `engine` judges them: `qualities[n]` labels the move that leads to
 * `plies[n + 1]`, once both are known.
 *
 * A move `book` marks (`book[n]` for the nth move) is labelled `book` at once,
 * since a lesson's guide recommends it; the engine never judges it.
 *
 * A move Stockfish listed among its top moves before it was played (a lesson
 * shows them past the guide, `getTopMoves`) is labelled from that list, at
 * once, when Stockfish judges: by how far its listed score falls short of the
 * first move's. Two searches of nearby positions can disagree by more than
 * an inaccuracy, so judging it from the evaluations instead could call the
 * list's own first move dubious.
 *
 * Only the move leading to `plies[shown]` (the board's) asks for its
 * evaluations: a search costs up to a second on a phone, and the engine runs
 * the newest request first. The other labels fill in as the board shows
 * each move.
 *
 * ```ts
 * const qualities = useMoveQualities(plies, ply, 'stockfish', bookMoves(lesson, moves));
 * ```
 */
export function useMoveQualities(
  plies: readonly Ply[],
  shown: number,
  engine: EvaluationEngine,
  book: readonly boolean[] = [],
): readonly (MoveQuality | undefined)[] {
  const state = use(StateContext);
  const ctrl = useController();
  const moves = plies.slice(1).map(({ move }) => move!.uci);
  // The moves before each position: `lines[n]` leads to `plies[n]`.
  const lines = plies.map((_, n) => moves.slice(0, n));
  const judged = shown > 0 && !book[shown - 1];
  const evaluationArgs = (line: readonly string[]) =>
    judged ? ([engine, line] as const) : ([null] as const);
  useFetch(getEvaluation, ...evaluationArgs(lines[shown - 1]));
  useFetch(getEvaluation, ...evaluationArgs(lines[shown]));
  const evaluations = lines.map(
    (line) => ctrl.getResponse(getEvaluation, engine, line, state).data,
  );
  return moves.map((uci, n) => {
    if (book[n]) return 'book';
    const mover = plies[n].turn;
    const top =
      engine === 'stockfish' ? ctrl.getResponse(getTopMoves, lines[n], state).data : undefined;
    const listed = top && judgedFromList(top, uci, mover);
    if (listed) return classifyMove(listed);
    const before = evaluations[n];
    const after = evaluations[n + 1];
    return before && after ? classifyMove({ before, after, uci, mover }) : undefined;
  });
}
