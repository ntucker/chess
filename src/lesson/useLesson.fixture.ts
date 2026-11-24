// Stand-ins for what `useLesson` reads besides the lesson and the game, for
// tests of it and of the screen built on it (useLesson.test.tsx,
// useLessonScreen.web.test.tsx). Labels, Stockfish's moves and progress read
// through Data Client, the opponent runs an engine, and focus and Stockfish's
// demand come from the app's providers. Each test passes these to `jest.mock`
// through `jest.requireActual`, so it stands in for the same modules the same
// way. Metro bundles only what the app imports, so this never ships.
import { createContext } from 'react';

import type { Settings } from '@/settings/settings';

export const moveQualities = {
  useMoveQualities: () => ({ qualities: [], refutations: [] }),
};

export const analysis = {
  analysisError: () => undefined,
  storedAnalyses: (_ctrl: unknown, _engine: unknown, lines: readonly unknown[]) =>
    lines.map(() => undefined),
  useAnalysis: () => undefined,
};

export const opponent = { gameOpponent: () => undefined, useWarmOpponent: () => {} };

export const router = { useIsFocused: () => true };

export const demand = { useNeedsStockfish: () => {} };

/**
 * Data Client, whose controller `controller` returns; nothing loads. Here and
 * below a function returns what the test passes, read only when the app calls
 * it, since `jest.mock` runs its factory before the test file's consts are set.
 */
export const dataClient = (controller: () => object) => ({
  StateContext: createContext({}),
  useController: controller,
  useSubscription: () => {},
  useSuspense: () => ({}),
});

export const settingsProvider = (settings: () => Settings) => ({ useSettings: settings });
