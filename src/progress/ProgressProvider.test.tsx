import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'test-renderer';

import { lineKeys } from '@/lesson/select';

import { positionHash } from './progress';
import { ProgressProvider, useLessonProgress, useProgressDispatch } from './ProgressProvider';

// Jest builds for native (see SettingsProvider.test.tsx): the first render
// already has the remembered progress.
let stored: Record<string, string>;
let root: Root | undefined;

beforeEach(() => {
  stored = {};
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => stored[key] ?? null,
      setItem: (key: string, value: string) => {
        stored[key] = value;
      },
    },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});

const START = lineKeys([])[0];

/** Renders the provider, marking START seen once when `mark`; answers each progress rendered. */
async function renderProgress(mark = false) {
  const seen: unknown[] = [];
  function Child() {
    const progress = useLessonProgress('caro-kann');
    const dispatch = useProgressDispatch();
    seen.push(progress);
    if (mark && !progress.seen.length) {
      queueMicrotask(() =>
        dispatch({ type: 'marked', lesson: 'caro-kann', mark: 'seen', key: START }),
      );
    }
    return null;
  }
  await act(async () => {
    root = createRoot();
    root.render(
      <ProgressProvider>
        <Child />
      </ProgressProvider>,
    );
  });
  return seen;
}

describe('ProgressProvider', () => {
  it('saves a mark, and nothing before one', async () => {
    await renderProgress();
    expect(stored).toEqual({});
    await act(async () => root?.unmount());
    await renderProgress(true);
    expect(JSON.parse(stored.progress)).toEqual({
      'caro-kann': { seen: [positionHash(START)], passed: [] },
    });
  });

  it('renders the remembered progress from the first frame on native', async () => {
    stored.progress = JSON.stringify({ 'caro-kann': { seen: ['abc'], passed: ['def'] } });
    const seen = await renderProgress();
    expect(seen[0]).toEqual({ seen: ['abc'], passed: ['def'] });
  });
});
