import { Endpoint, Entity } from '@data-client/rest';

import { readStorage, storageKey, writeStorage } from '@/context/storage';
import type { PositionKey } from '@/lesson/lesson';
import {
  parseSavedFinds,
  type SavedFind,
  type SavedFinds,
  savedFindsText,
  withoutSaved,
  withSaved,
} from '@/opportunity/saved';

import { StorageSync } from './storageSync';

/** Where the saved finds are kept (`savedFindsText`). */
const KEY = storageKey('finds');

/** The finds the device keeps (src/opportunity/saved.ts), by lesson id: one record for every lesson. */
export class DeviceFinds extends Entity {
  readonly lessons: SavedFinds = {};

  pk() {
    return 'device';
  }

  static key = 'DeviceFinds';
}

const saved = (): SavedFinds => parseSavedFinds(readStorage(KEY) ?? '');

/** Keeps `finds` as the device's saved finds, and answers with them. */
const save = (finds: SavedFinds) => {
  writeStorage(KEY, savedFindsText(finds));
  return { lessons: finds };
};

/**
 * The finds the learner saved, by lesson id, read from the device. They
 * change only by `saveFind` and `unsaveFind`, or by another tab saving
 * (`SavedFindsSync`).
 *
 * ```ts
 * const finds = useSuspense(getSavedFinds).lessons['stafford'];
 * ```
 */
export const getSavedFinds = new Endpoint(async () => ({ lessons: saved() }), {
  schema: DeviceFinds,
  name: 'getSavedFinds',
  dataExpiryLength: Infinity,
});

/**
 * Saves `find` among the lesson `lesson`'s, in place of one at its cue. It
 * adds to what the device has saved at that moment, so finds another tab
 * saved are kept.
 *
 * ```ts
 * ctrl.fetch(saveFind, { lesson: 'stafford', find: savedFind(find, source) });
 * ```
 */
export const saveFind = new Endpoint(
  async ({ lesson, find }: { lesson: string; find: SavedFind }) =>
    save(withSaved(saved(), lesson, find)),
  { schema: DeviceFinds, sideEffect: true, name: 'saveFind' },
);

/**
 * Forgets the lesson `lesson`'s saved find at `cue` (`cueOf`), the inverse
 * of `saveFind`.
 *
 * ```ts
 * ctrl.fetch(unsaveFind, { lesson: 'stafford', cue });
 * ```
 */
export const unsaveFind = new Endpoint(
  async ({ lesson, cue }: { lesson: string; cue: PositionKey }) =>
    save(withoutSaved(saved(), lesson, cue)),
  { schema: DeviceFinds, sideEffect: true, name: 'unsaveFind' },
);

/** Takes in the finds another tab saves, so each tab lists the finds saved in all of them (`StorageSync`). */
export class SavedFindsSync extends StorageSync {
  constructor() {
    super(KEY, (controller) => controller.setResponse(getSavedFinds, { lessons: saved() }));
  }
}
