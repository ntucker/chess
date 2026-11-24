import { parseStoredObject, storageKey } from '@/context/storage';
import { EVALUATION_ENGINES, type EvaluationEngine } from '@/evaluation/evaluation';
import { type Color, COLORS } from '@/game/replay';
import { type Opponent, OPPONENTS } from '@/opponent/opponent';

/** The key the settings are saved under. */
export const SETTINGS_KEY = storageKey('settings');

export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const NOTATIONS = ['icons', 'letters'] as const;
export type Notation = (typeof NOTATIONS)[number];

/** What the learner chose, remembered on the device as one object. */
export interface Settings {
  /** Who plays the other side: a Maia rating, or Stockfish above them all. */
  readonly opponent: Opponent;
  /** Who judges positions for the evaluation bar. */
  readonly evaluationEngine: EvaluationEngine;
  /** In a lesson, the opponent replies by itself (auto play); off, the learner picks its move. */
  readonly auto: boolean;
  /** In a lesson's Explore, the next moves' arrows and Stockfish's best are drawn before the learner points at one. */
  readonly showMoves: boolean;
  /** In a lesson, a trap's moves are drawn before the learner can fall in. */
  readonly showTraps: boolean;
  /** The side whose openings the start position lists: the side of the lesson last played. */
  readonly side: Color;
  /** Light or dark colors, or the device's light or dark setting. */
  readonly theme: Theme;
  /** How a move's name shows its piece: as an icon (♞f3) or a letter (Nf3). */
  readonly notation: Notation;
}

/** The settings before the learner chooses, which the pre-rendered page shows. */
export const DEFAULT_SETTINGS: Settings = {
  // Maia at club level.
  opponent: 1500,
  evaluationEngine: 'stockfish',
  auto: true,
  showMoves: true,
  // Off, the learner can fall into a trap and see it explained.
  showTraps: false,
  // Most lessons are defences.
  side: 'black',
  theme: 'system',
  notation: 'icons',
};

export type SettingsAction =
  /** The remembered settings, read as the app starts or another tab saves them. */
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
export const parseSettings = (text: string) => settingsFrom(parseStoredObject(text));

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
    showMoves: oneOf(BOOLEANS, stored.showMoves) ?? DEFAULT_SETTINGS.showMoves,
    showTraps: oneOf(BOOLEANS, stored.showTraps) ?? DEFAULT_SETTINGS.showTraps,
    side: oneOf(COLORS, stored.side) ?? DEFAULT_SETTINGS.side,
    theme: oneOf(THEMES, stored.theme) ?? DEFAULT_SETTINGS.theme,
    notation: oneOf(NOTATIONS, stored.notation) ?? DEFAULT_SETTINGS.notation,
  };
}

const oneOf = <T>(choices: readonly T[], value: unknown) =>
  choices.find((choice) => choice === value);
