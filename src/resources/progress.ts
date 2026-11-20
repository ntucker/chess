import type { Controller, Manager, Middleware } from '@data-client/react';
import { Endpoint, Entity, Values } from '@data-client/rest';

import { readStorage, storageKey, subscribeStorage, writeStorage } from '@/context/storage';
import type { PositionKey } from '@/lesson/lesson';
import {
  type Mark,
  parseProgress,
  type SavedProgress,
  UNTOUCHED,
  withMark,
} from '@/progress/progress';

import { LESSONS } from './lesson';

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

/** Every shipped lesson's progress in `progress`, by lesson id, untouched ones too. */
const everyLesson = (progress: SavedProgress) =>
  Object.fromEntries(Object.keys(LESSONS).map((lesson) => [lesson, lessonOf(progress, lesson)]));

/**
 * The learner's progress in every lesson, by lesson id, read from the
 * device: one read serves the lesson played and the start position, whose
 * rows each show their own opening's. It changes only by `addMark`, or by
 * another tab saving (`ProgressSync`).
 *
 * ```ts
 * const { seen, passed } = useSuspense(getProgress)['caro-kann'];
 * ```
 */
export const getProgress = new Endpoint(async () => everyLesson(saved()), {
  schema: new Values(LessonProgress),
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
  private unsubscribe?: () => void;

  middleware: Middleware = (controller) => {
    this.controller = controller;
    return (next) => next;
  };

  // What is saved now, not the event's value: this tab may have saved a newer
  // mark since the other tab's save queued the event.
  private load = () => {
    this.controller?.setResponse(getProgress, everyLesson(saved()));
  };

  init() {
    this.unsubscribe = subscribeStorage(KEY, this.load);
  }

  cleanup() {
    this.unsubscribe?.();
  }
}
