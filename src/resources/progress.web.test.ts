import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
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
const syncs: ProgressSync[] = [];
function newStore() {
  const sync = new ProgressSync();
  syncs.push(sync);
  const { controller } = prepareStore(initialState, () => [sync, new NetworkManager()], Controller);
  sync.init();
  const shown = () =>
    controller.getResponse(getProgress, controller.getState()).data?.['caro-kann'];
  return { controller, shown };
}

beforeEach(() => localStorage.clear());
afterEach(() => syncs.splice(0).forEach((sync) => sync.cleanup()));

describe('progress on the device', () => {
  it("reads every lesson's saved progress, and nothing for a lesson never played", async () => {
    save([positionHash(START)]);
    const { controller } = newStore();
    expect(await controller.fetch(getProgress)).toMatchObject({
      'caro-kann': { seen: [positionHash(START)], passed: [] },
      slav: { seen: [], passed: [] },
    });
  });

  it('adds a mark once, saving it and showing it wherever the lesson is read', async () => {
    const { controller, shown } = newStore();
    await controller.fetch(getProgress);
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: START });
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: START });
    expect(saved()['caro-kann'].seen).toEqual([positionHash(START)]);
    expect(shown()).toMatchObject({ seen: [positionHash(START)] });
  });

  it('keeps the marks another tab saved since this one read them', async () => {
    const { controller } = newStore();
    await controller.fetch(getProgress);
    save([positionHash(AFTER_E4)]);
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: START });
    expect(saved()['caro-kann'].seen).toEqual([positionHash(AFTER_E4), positionHash(START)]);
  });

  it('shows what another tab saves', async () => {
    const { controller, shown } = newStore();
    await controller.fetch(getProgress);
    save([positionHash(AFTER_E4)]);
    window.dispatchEvent(new StorageEvent('storage', { key: 'progress' }));
    expect(shown()).toMatchObject({ seen: [positionHash(AFTER_E4)] });
  });

  it("keeps this tab's newer marks when another tab's older save arrives", async () => {
    const { controller, shown } = newStore();
    save([positionHash(START)]);
    const older = localStorage.getItem('progress');
    await controller.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key: AFTER_E4 });
    window.dispatchEvent(new StorageEvent('storage', { key: 'progress', newValue: older }));
    expect(shown()).toMatchObject({ seen: [positionHash(START), positionHash(AFTER_E4)] });
  });
});
