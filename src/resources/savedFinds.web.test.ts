import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Controller, NetworkManager } from '@data-client/react';
import { initialState, prepareStore } from '@data-client/react/redux';

import { uciLine } from '@/lesson/lesson.fixture';
import { cueOf, type SavedFind, savedFindsText } from '@/opportunity/saved';

import { getSavedFinds, saveFind, SavedFindsSync, unsaveFind } from './savedFinds';

/** 2...Nc6 3.Nxe5? Nxe5 4.d4 Nc6. */
const NXE5 = uciLine('e4', 'e5', 'Nf3', 'Nc6', 'Nxe5', 'Nxe5', 'd4', 'Nc6');
const FIND: SavedFind = {
  line: NXE5.slice(0, 4),
  mistake: NXE5[4],
  replies: [NXE5[5]],
  payoff: NXE5.slice(6),
  cost: 0.3,
  source: { from: 'maia', rating: 1500 },
  reach: 0.4,
  share: 0.05,
  gain: 0.5,
};
/** 2...d6 3.Nxe5? dxe5. */
const OTHER: SavedFind = {
  ...FIND,
  line: uciLine('e4', 'e5', 'Nf3', 'd6'),
  replies: [uciLine('e4', 'e5', 'Nf3', 'd6', 'Nxe5', 'dxe5')[5]],
  payoff: [],
};

const stored = () => localStorage.getItem('finds');

/** A store as the app's DataProvider makes it, with saved finds kept in sync across tabs. */
const syncs: SavedFindsSync[] = [];
function newStore() {
  const sync = new SavedFindsSync();
  syncs.push(sync);
  const { controller } = prepareStore(initialState, () => [sync, new NetworkManager()], Controller);
  sync.init();
  const shown = () =>
    controller.getResponse(getSavedFinds, controller.getState()).data?.lessons.stafford;
  return { controller, shown };
}

/** Once `fetching` resolves and the store has taken in its answer, a moment after. */
const settled = async (fetching: Promise<unknown>) => {
  await fetching;
  await new Promise((resolve) => setTimeout(resolve));
};

beforeEach(() => localStorage.clear());
afterEach(() => syncs.splice(0).forEach((sync) => sync.cleanup()));

describe('saved finds on the device', () => {
  it('saves a find and forgets it again, showing each wherever the finds are read', async () => {
    const { controller, shown } = newStore();
    await controller.fetch(getSavedFinds);
    expect(shown()).toBeUndefined();
    await settled(controller.fetch(saveFind, { lesson: 'stafford', find: FIND }));
    expect(shown()).toEqual([FIND]);
    expect(stored()).toBe(savedFindsText({ stafford: [FIND] }));
    await settled(controller.fetch(unsaveFind, { lesson: 'stafford', cue: cueOf(FIND) }));
    expect(shown()).toBeUndefined();
    expect(stored()).toBe(savedFindsText({}));
  });

  it('keeps the finds another tab saved since this one read them', async () => {
    const { controller } = newStore();
    await controller.fetch(getSavedFinds);
    localStorage.setItem('finds', savedFindsText({ stafford: [OTHER] }));
    await controller.fetch(saveFind, { lesson: 'stafford', find: FIND });
    expect(stored()).toBe(savedFindsText({ stafford: [OTHER, FIND] }));
  });

  it('shows what another tab saves', async () => {
    const { controller, shown } = newStore();
    await controller.fetch(getSavedFinds);
    localStorage.setItem('finds', savedFindsText({ stafford: [FIND] }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'finds' }));
    expect(shown()).toEqual([FIND]);
  });
});
