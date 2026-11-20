import { beforeEach, describe, expect, it } from '@jest/globals';
import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';

import { lineKeys } from '@/lesson/select';
import { positionHash } from '@/progress/progress';

import { addMark, getProgress, ProgressSync } from './progress';

const [START, AFTER_E4] = lineKeys(['e2e4']);
const saved = () => JSON.parse(localStorage.getItem('progress') ?? 'null');
const save = (seen: string[]) =>
  localStorage.setItem('progress', JSON.stringify({ 'caro-kann': { seen, passed: [] } }));

/** A store as the app's DataProvider makes it, with progress kept in sync across tabs. */
function newStore() {
  const sync = new ProgressSync();
  const { controller } = prepareStore(initialState, () => [sync, new NetworkManager()], Controller);
  sync.init();
  const shown = () => controller.getResponse(getProgress, 'caro-kann', controller.getState()).data;
  return { controller, sync, shown };
}

beforeEach(() => localStorage.clear());

describe('progress on the device', () => {
  it('reads the saved progress, and nothing for a lesson never played', async () => {
    save([positionHash(START)]);
    const { controller } = newStore();
    expect(await controller.fetch(getProgress, 'caro-kann')).toMatchObject({
      seen: [positionHash(START)],
      passed: [],
    });
    expect(await controller.fetch(getProgress, 'slav')).toMatchObject({ seen: [], passed: [] });
  });

  it('adds a mark once, saving it and showing it wherever the lesson is read', async () => {
    const { controller, shown } = newStore();
    await controller.fetch(getProgress, 'caro-kann');
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: START });
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: START });
    expect(saved()['caro-kann'].seen).toEqual([positionHash(START)]);
    expect(shown()).toMatchObject({ seen: [positionHash(START)] });
  });

  it('keeps the marks another tab saved since this one read them', async () => {
    const { controller } = newStore();
    await controller.fetch(getProgress, 'caro-kann');
    save([positionHash(AFTER_E4)]);
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: START });
    expect(saved()['caro-kann'].seen).toEqual([positionHash(AFTER_E4), positionHash(START)]);
  });

  it('shows what another tab saves', async () => {
    const { controller, sync, shown } = newStore();
    await controller.fetch(getProgress, 'caro-kann');
    const newValue = JSON.stringify({
      'caro-kann': { seen: [positionHash(AFTER_E4)], passed: [] },
    });
    window.dispatchEvent(new StorageEvent('storage', { key: 'progress', newValue }));
    expect(shown()).toMatchObject({ seen: [positionHash(AFTER_E4)] });
    sync.cleanup();
  });
});
