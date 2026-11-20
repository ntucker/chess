/**
 * The learner's progress through each lesson, remembered on the device (tech
 * plan section 6): the positions Explore has shown, and the guide line ends a
 * clean Practice run has reached. Positions are kept as short hashes of their
 * keys, so a lesson's progress stays small however much of it is played.
 * It is read and saved through src/resources/progress.ts; what the marks
 * mean on screen is src/lesson/marks.ts.
 */
import { isObject, parseStoredObject } from '@/context/storage';
import type { PositionKey } from '@/lesson/lesson';

/** Two facts about a position, earned independently, so neither overwrites the other. */
export type Mark = 'seen' | 'passed';

/** One lesson's progress: the `positionHash` of each position with that mark. */
export type MarkedPositions = Readonly<Record<Mark, readonly string[]>>;

/** Every lesson's progress, by lesson id, as it is saved. */
export type SavedProgress = Readonly<Record<string, MarkedPositions>>;

/** A lesson nothing is remembered for. */
export const UNTOUCHED: MarkedPositions = { seen: [], passed: [] };

/**
 * `saved` with `key` marked `mark` in the lesson `lesson`, or `saved` itself
 * when it already is. Marks are only ever added.
 */
export function withMark(
  saved: SavedProgress,
  lesson: string,
  mark: Mark,
  key: PositionKey,
): SavedProgress {
  const marks = saved[lesson] ?? UNTOUCHED;
  const hash = positionHash(key);
  if (marks[mark].includes(hash)) return saved;
  return { ...saved, [lesson]: { ...marks, [mark]: [...marks[mark], hash] } };
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
export function parseProgress(text: string): SavedProgress {
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
