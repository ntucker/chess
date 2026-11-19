import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { lineKeys } from '@/lesson/select';

import { positionHash } from './progress';
import { ProgressProvider, useLessonProgress, useProgressDispatch } from './ProgressProvider';

// The web path: each provider starts with nothing, loads the remembered
// progress once the page starts, and takes in what another tab saves.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];

beforeEach(() => localStorage.clear());

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
});

const [START, AFTER_E4] = lineKeys(['e2e4']);
const saved = () => JSON.parse(localStorage.getItem('progress') ?? 'null');

/** A provider marking `key` seen once it renders, as a tab does; answers what it renders. */
async function renderTab(key: string) {
  const shown: { seen: readonly string[] }[] = [];
  function Child() {
    const progress = useLessonProgress('caro-kann');
    const dispatch = useProgressDispatch();
    shown.push(progress);
    if (!progress.seen.includes(positionHash(key))) {
      queueMicrotask(() => dispatch({ type: 'marked', lesson: 'caro-kann', mark: 'seen', key }));
    }
    return null;
  }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () =>
    root.render(
      <ProgressProvider>
        <Child />
      </ProgressProvider>,
    ),
  );
  return shown;
}

describe('ProgressProvider on the web', () => {
  it('keeps the remembered progress, adding marks earned as the page starts', async () => {
    localStorage.setItem(
      'progress',
      JSON.stringify({ 'caro-kann': { seen: [positionHash(AFTER_E4)], passed: [] } }),
    );
    const shown = await renderTab(START);
    // The pre-rendered page's first frame has nothing remembered.
    expect(shown[0]).toEqual({ seen: [], passed: [] });
    expect(new Set(saved()['caro-kann'].seen)).toEqual(
      new Set([positionHash(AFTER_E4), positionHash(START)]),
    );
  });

  it("keeps another tab's marks when it saves", async () => {
    await renderTab(START);
    // Another tab marks a position and saves; the browser tells this tab.
    localStorage.setItem(
      'progress',
      JSON.stringify({ 'caro-kann': { seen: [positionHash(AFTER_E4)], passed: [] } }),
    );
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'progress' }));
    });
    expect(new Set(saved()['caro-kann'].seen)).toEqual(
      new Set([positionHash(START), positionHash(AFTER_E4)]),
    );
  });
});
