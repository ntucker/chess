import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { setEvaluationEngine, useEvaluationEngine } from '@/evaluation/useEvaluationEngine';
import { JUDGE_RATING } from '@/maia/maia';

import { FootnoteChoice } from './FootnoteChoice';

const CHOICES: Record<EvaluationEngine, { label: string; hint: string }> = {
  stockfish: {
    label: 'Stockfish',
    hint: 'How the position stands, judged by the Stockfish chess engine.',
  },
  maia: {
    label: 'Maia',
    hint: `How players rated about ${JUDGE_RATING} tend to score from here. Uses less memory.`,
  },
};

const OPTIONS = EVALUATION_ENGINES.map((value) => ({ value, ...CHOICES[value] }));

/**
 * A footnote that picks the engine judging the evaluation bar: "Evaluation by
 * Stockfish · Maia".
 */
export function EvaluationEngineChoice() {
  return (
    <FootnoteChoice
      name="Evaluation bar"
      lead="Evaluation by"
      options={OPTIONS}
      value={useEvaluationEngine()}
      onChange={setEvaluationEngine}
    />
  );
}
