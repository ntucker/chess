import { useSyncExternalStore } from 'react';

import { DEFAULT_ENGINE, type EvaluationEngine } from './evaluation';

// The engine the evaluation bar uses, remembered in localStorage (on iOS and
// Android, expo-sqlite provides it; see src/app/_layout.tsx).

const KEY = 'evaluationEngine';
const listeners = new Set<() => void>();
let current: EvaluationEngine | undefined;

function read(): EvaluationEngine {
  if (current) return current;
  try {
    current = globalThis.localStorage?.getItem(KEY) === 'maia' ? 'maia' : DEFAULT_ENGINE;
  } catch {
    // Storage can be blocked, for example in a private window.
    current = DEFAULT_ENGINE;
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Switches the evaluation bar to `engine`, and remembers it. */
export function setEvaluationEngine(engine: EvaluationEngine) {
  current = engine;
  try {
    globalThis.localStorage?.setItem(KEY, engine);
  } catch {
    // Kept for this visit only.
  }
  for (const listener of listeners) listener();
}

/**
 * The engine the evaluation bar uses. The server renders the default, and the
 * page switches to the remembered one as it starts.
 */
export function useEvaluationEngine(): EvaluationEngine {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_ENGINE);
}
