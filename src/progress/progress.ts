/**
 * The learner's progress through each lesson, remembered on the device (tech
 * plan section 6): the positions Explore has shown, and the guide line ends a
 * clean Practice run has reached. Positions are kept as short hashes of their
 * keys, so a lesson's progress stays small however much of it is played.
 * What the marks mean on screen is src/lesson/marks.ts.
 */
import { isObject, parseStoredObject } from '@/context/storage';
import type { PositionKey } from '@/lesson/lesson';

/** Two facts about a position, earned independently, so neither overwrites the other. */
export type Mark = 'seen' | 'passed';

/** One lesson's progress: the `positionHash` of each position with that mark. */
export type LessonProgress = Readonly<Record<Mark, readonly string[]>>;

/** Every lesson's progress, by lesson id. */
export type Progress = Readonly<Record<string, LessonProgress>>;

export const NO_PROGRESS: Progress = {};

/** A lesson nothing is remembered for. */
export const UNTOUCHED: LessonProgress = { seen: [], passed: [] };

export type ProgressAction =
  /** The remembered progress, read once as the app starts. */
  | { readonly type: 'loaded'; readonly progress: Progress }
  /** The lesson `lesson` showed `key` in Explore (`seen`), or a clean run reached it as a line's end (`passed`). */
  | {
      readonly type: 'marked';
      readonly lesson: string;
      readonly mark: Mark;
      readonly key: PositionKey;
    };

/**
 * The progress after `action`. Marks are only ever added; adding one already
 * there keeps the state. Loading keeps any mark earned before the remembered
 * progress arrived.
 */
export function progressReducer(progress: Progress, action: ProgressAction): Progress {
  switch (action.type) {
    case 'loaded':
      return mergeProgress(action.progress, progress);
    case 'marked': {
      const lesson = progress[action.lesson] ?? UNTOUCHED;
      const hash = positionHash(action.key);
      const marked = lesson[action.mark];
      if (marked.includes(hash)) return progress;
      return { ...progress, [action.lesson]: { ...lesson, [action.mark]: [...marked, hash] } };
    }
  }
}

function mergeProgress(into: Progress, more: Progress): Progress {
  const merged: Record<string, LessonProgress> = { ...into };
  for (const [id, lesson] of Object.entries(more)) {
    const was = merged[id] ?? UNTOUCHED;
    merged[id] = {
      seen: [...new Set([...was.seen, ...lesson.seen])],
      passed: [...new Set([...was.passed, ...lesson.passed])],
    };
  }
  return merged;
}

/**
 * A short, stable stand-in for a position key: 53 bits of the cyrb53 hash in
 * base 36, 11 characters at most. Among a lesson's tens of thousands of
 * positions a collision is far less likely than one in a million, and would
 * only show one wrong mark.
 */
export function positionHash(key: PositionKey): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (2 ** 32 * (h2 & 0x1fffff) + (h1 >>> 0)).toString(36);
}

/**
 * The progress saved as `text` (JSON). Anything that isn't a lesson's two
 * lists of strings is dropped, so a damaged save loses only what it damaged.
 */
export function parseProgress(text: string): Progress {
  return Object.fromEntries(
    Object.entries(parseStoredObject(text)).flatMap(([id, lesson]) =>
      isObject(lesson)
        ? [[id, { seen: strings(lesson.seen), passed: strings(lesson.passed) }]]
        : [],
    ),
  );
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
