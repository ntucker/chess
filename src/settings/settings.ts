import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { DEFAULT_OPPONENT, type Opponent, OPPONENTS } from '@/opponent/opponent';

/** What the learner chose, remembered on the device as one object. */
export interface Settings {
  /** Who plays the other side: a Maia rating, or Stockfish above them all. */
  readonly opponent: Opponent;
  /** Who judges positions for the evaluation bar. */
  readonly evaluationEngine: EvaluationEngine;
}

/** The settings before the learner chooses, which the pre-rendered page shows. */
export const DEFAULT_SETTINGS: Settings = {
  opponent: DEFAULT_OPPONENT,
  evaluationEngine: 'stockfish',
};

export type SettingsAction =
  /** The remembered settings, read once as the app starts. */
  | { readonly type: 'loaded'; readonly settings: Settings }
  /** The learner chose new values for some settings. */
  | { readonly type: 'chosen'; readonly choice: Partial<Settings> };

export function settingsReducer(settings: Settings, action: SettingsAction): Settings {
  switch (action.type) {
    case 'loaded':
      return action.settings;
    case 'chosen':
      return { ...settings, ...action.choice };
  }
}

/** The settings saved as `text` (JSON), read as settingsFrom does. */
export const parseSettings = (text: string) => settingsFrom(parseObject(text));

/**
 * The settings in `stored`. A value that is missing, or no longer one of its
 * choices, reads as its default, so a setting added or removed later keeps
 * the rest.
 */
export function settingsFrom(stored: Partial<Record<keyof Settings, unknown>>): Settings {
  return {
    opponent: oneOf(OPPONENTS, stored.opponent) ?? DEFAULT_SETTINGS.opponent,
    evaluationEngine:
      oneOf(EVALUATION_ENGINES, stored.evaluationEngine) ?? DEFAULT_SETTINGS.evaluationEngine,
  };
}

const oneOf = <T>(choices: readonly T[], value: unknown) =>
  choices.find((choice) => choice === value);

function parseObject(text: string): Partial<Record<keyof Settings, unknown>> {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
