import { createSetting, oneOf } from '@/settings/setting';

import { EVALUATION_ENGINES, type EvaluationEngine } from './evaluation';

const setting = createSetting<EvaluationEngine>(
  'evaluationEngine',
  oneOf(EVALUATION_ENGINES),
  'stockfish',
);

/** The engine the evaluation bar uses. */
export const useEvaluationEngine = setting.useValue;

/** Switches the evaluation bar to `engine`, and remembers it. */
export const setEvaluationEngine = setting.set;
