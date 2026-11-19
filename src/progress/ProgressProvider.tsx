import { createContext, type Dispatch, type ReactNode, use } from 'react';

import { requireProvider } from '@/context/requireProvider';
import { readStorage, useRememberedReducer } from '@/context/useRememberedReducer';

import {
  NO_PROGRESS,
  parseProgress,
  type Progress,
  type ProgressAction,
  progressReducer,
  UNTOUCHED,
} from './progress';

const KEY = 'progress';

// No defaults: a component outside ProgressProvider fails loudly rather than
// dropping marks.
const ProgressContext = createContext<Progress | null>(null);
const DispatchContext = createContext<Dispatch<ProgressAction> | null>(null);

const loaded = (progress: Progress): ProgressAction => ({ type: 'loaded', progress });

function recall(): Progress | undefined {
  const stored = readStorage(KEY);
  return stored == null ? undefined : parseProgress(stored);
}

/**
 * Holds the learner's progress in every lesson for everything inside it, and
 * saves it after each change. Like SettingsProvider, the web starts with
 * nothing and loads the remembered progress once the page starts.
 */
export function ProgressProvider({ children }: { readonly children: ReactNode }) {
  const [progress, dispatch] = useRememberedReducer(progressReducer, NO_PROGRESS, {
    key: KEY,
    recall,
    loaded,
  });
  return (
    <ProgressContext value={progress}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </ProgressContext>
  );
}

/** The learner's progress in the lesson `id`. Throws outside ProgressProvider. */
export const useLessonProgress = (id: string) =>
  requireProvider(use(ProgressContext), 'ProgressProvider')[id] ?? UNTOUCHED;

/**
 * Records progress: `dispatch({ type: 'marked', lesson: 'caro-kann', mark: 'seen', key })`.
 * Throws outside ProgressProvider.
 */
export const useProgressDispatch = () => requireProvider(use(DispatchContext), 'ProgressProvider');
