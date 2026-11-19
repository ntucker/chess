import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { type Opponent, OPPONENTS } from '@/opponent/opponent';

/** What the learner chose, remembered on the device as one object. */
export interface Settings {
  /** Who plays the other side: a Maia rating, or Stockfish above them all. */
  readonly opponent: Opponent;
  /** Who judges positions for the evaluation bar. */
  readonly evaluationEngine: EvaluationEngine;
  /** In a lesson, the opponent replies by itself (Auto); off, the learner picks its move. */
  readonly auto: boolean;
  /** In a lesson's Explore mode, ideas are drawn on the board, not only described. */
  readonly showIdeas: boolean;
  /** In a lesson, a trap's moves are drawn before the learner can fall in. */
  readonly showTraps: boolean;
}

/** The settings before the learner chooses, which the pre-rendered page shows. */
export const DEFAULT_SETTINGS: Settings = {
  // Maia at club level.
  opponent: 1500,
  evaluationEngine: 'stockfish',
  auto: true,
  showIdeas: true,
  // Off, the learner can fall into a trap and see it explained.
  showTraps: false,
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

/** Settings as saved: any field may be missing or hold anything. */
type StoredSettings = Partial<Record<keyof Settings, unknown>>;

/** The settings saved as `text` (JSON), read as settingsFrom does. */
export const parseSettings = (text: string) => settingsFrom(parseObject(text));

const BOOLEANS = [true, false] as const;

/**
 * The settings in `stored`. A value that is missing, or no longer one of its
 * choices, reads as its default, so a setting added or removed later keeps
 * the rest.
 */
export function settingsFrom(stored: StoredSettings): Settings {
  return {
    opponent: oneOf(OPPONENTS, stored.opponent) ?? DEFAULT_SETTINGS.opponent,
    evaluationEngine:
      oneOf(EVALUATION_ENGINES, stored.evaluationEngine) ?? DEFAULT_SETTINGS.evaluationEngine,
    auto: oneOf(BOOLEANS, stored.auto) ?? DEFAULT_SETTINGS.auto,
    showIdeas: oneOf(BOOLEANS, stored.showIdeas) ?? DEFAULT_SETTINGS.showIdeas,
    showTraps: oneOf(BOOLEANS, stored.showTraps) ?? DEFAULT_SETTINGS.showTraps,
  };
}

const oneOf = <T>(choices: readonly T[], value: unknown) =>
  choices.find((choice) => choice === value);

function parseObject(text: string): StoredSettings {
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
