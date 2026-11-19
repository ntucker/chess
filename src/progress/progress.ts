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
  /** The remembered progress, read as the app starts or another tab saves it. */
  | { readonly type: 'loaded'; readonly progress: Progress }
  /**
   * The lesson `lesson` showed `key` in Explore (`seen`), or a clean run
   * reached it as a line's end (`passed`).
   */
  | {
      readonly type: 'marked';
      readonly lesson: string;
      readonly mark: Mark;
      readonly key: PositionKey;
    };

/**
 * The progress after `action`. Marks are only ever added; adding one already
 * there keeps the state. Loading adds the remembered marks to any earned
 * before they arrived, or saved since by another tab.
 */
export function progressReducer(progress: Progress, action: ProgressAction): Progress {
  switch (action.type) {
    case 'loaded':
      return withRemembered(progress, action.progress);
    case 'marked': {
      const lesson = progress[action.lesson] ?? UNTOUCHED;
      const hash = positionHash(action.key);
      const marked = lesson[action.mark];
      if (marked.includes(hash)) return progress;
      return { ...progress, [action.lesson]: { ...lesson, [action.mark]: [...marked, hash] } };
    }
  }
}

/** `progress` with every mark of `remembered` added, or `progress` itself when none is new. */
function withRemembered(progress: Progress, remembered: Progress): Progress {
  let merged: Record<string, LessonProgress> | undefined;
  for (const [id, lesson] of Object.entries(remembered)) {
    const now = progress[id] ?? UNTOUCHED;
    const seen = union(now.seen, lesson.seen);
    const passed = union(now.passed, lesson.passed);
    if (seen !== now.seen || passed !== now.passed)
      (merged ??= { ...progress })[id] = { seen, passed };
  }
  return merged ?? progress;
}

/** `have` with the hashes of `more` it lacks added after, or `have` itself when it lacks none. */
function union(have: readonly string[], more: readonly string[]): readonly string[] {
  const known = new Set(have);
  const extra = more.filter((hash) => !known.has(hash));
  return extra.length ? [...have, ...extra] : have;
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
