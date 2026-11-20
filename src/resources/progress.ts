import type { Controller, Manager, Middleware } from '@data-client/react';
import { Endpoint, Entity } from '@data-client/rest';

import { readStorage, storageKey, writeStorage } from '@/context/storage';
import type { PositionKey } from '@/lesson/lesson';
import {
  type Mark,
  parseProgress,
  type SavedProgress,
  UNTOUCHED,
  withMark,
} from '@/progress/progress';

/** Where the progress is saved, as JSON (`SavedProgress`). */
const KEY = storageKey('progress');

/** One lesson's progress (src/progress/progress.ts): the positions with each mark. */
export class LessonProgress extends Entity {
  readonly lesson: string = '';
  readonly seen: readonly string[] = [];
  readonly passed: readonly string[] = [];

  pk() {
    return this.lesson;
  }

  static key = 'LessonProgress';
}

const saved = (): SavedProgress => parseProgress(readStorage(KEY) ?? '{}');

const lessonOf = (progress: SavedProgress, lesson: string) => ({
  lesson,
  ...(progress[lesson] ?? UNTOUCHED),
});

/**
 * The learner's progress in the lesson `lesson`, read from the device. It
 * changes only by `addMark`, or by another tab saving (`ProgressSync`).
 *
 * ```ts
 * const { seen, passed } = useSuspense(getProgress, 'caro-kann');
 * ```
 */
export const getProgress = new Endpoint(async (lesson: string) => lessonOf(saved(), lesson), {
  schema: LessonProgress,
  name: 'getProgress',
  dataExpiryLength: Infinity,
});

/**
 * Marks `key` in the lesson `lesson`: Explore showed it (`seen`), or a clean
 * run reached it as a line's end (`passed`). It adds the mark to what the
 * device has saved at that moment, so marks another tab saved are kept.
 *
 * ```ts
 * ctrl.fetch(addMark, { lesson: 'caro-kann', mark: 'seen', key });
 * ```
 */
export const addMark = new Endpoint(
  async ({ lesson, mark, key }: { lesson: string; mark: Mark; key: PositionKey }) => {
    const before = saved();
    const after = withMark(before, lesson, mark, key);
    if (after !== before) writeStorage(KEY, JSON.stringify(after));
    return lessonOf(after, lesson);
  },
  { schema: LessonProgress, sideEffect: true, name: 'addMark' },
);

/**
 * Takes in the progress another tab saves (the web's `storage` event), so
 * each tab shows the marks earned in all of them. Native has one window.
 */
export class ProgressSync implements Manager {
  private controller?: Controller;

  middleware: Middleware = (controller) => {
    this.controller = controller;
    return (next) => async (action) => next(action);
  };

  private onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    // What is saved now, not the event's value: this tab may have saved a
    // newer mark since the other tab's save queued the event.
    const progress = saved();
    this.controller?.set(
      [LessonProgress],
      Object.keys(progress).map((lesson) => lessonOf(progress, lesson)),
    );
  };

  init() {
    if (process.env.EXPO_OS === 'web') window.addEventListener('storage', this.onStorage);
  }

  cleanup() {
    if (process.env.EXPO_OS === 'web') window.removeEventListener('storage', this.onStorage);
  }
}
