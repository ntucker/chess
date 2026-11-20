import { Endpoint } from '@data-client/rest';

import INDEX from '@/assets/lessons/index.json';
import { type Lesson, readLesson } from '@/lesson/lesson';
import type { IndexEntry } from '@/lesson/openings';

/**
 * Every lesson the app ships, by id: one static JSON file each, loaded only
 * when asked for. Metro needs a literal path in each `import()`.
 */
export const LESSONS = {
  'caro-kann': () => import('@/assets/lessons/caro-kann.json'),
  slav: () => import('@/assets/lessons/slav.json'),
};

export type LessonId = keyof typeof LESSONS;

/**
 * What the start position shows of each lesson before it loads, in the order
 * it lists them (src/lesson/openings.ts). The importer writes it beside the
 * lesson files, and src/resources/lesson.test.ts holds it to them.
 */
export const LESSON_INDEX = INDEX as Readonly<Record<LessonId, IndexEntry>>;

/**
 * The lesson for one opening (see src/lesson/lesson.ts). It ships with the
 * app and never changes, so it is kept for as long as the app runs.
 *
 * ```ts
 * const lesson = useSuspense(getLesson, 'caro-kann');
 * ```
 */
export const getLesson = new Endpoint(
  async (id: LessonId) => readLesson((await LESSONS[id]()).default),
  { name: 'getLesson', dataExpiryLength: Infinity },
);

/**
 * The lessons `ids` that load, by id (see `getLesson`), for a screen that
 * needs several at once and can do without any of them: one that fails to
 * load (a chunk gone after a redeploy, or no network) is left out, and stays
 * out until `ids` changes, since the answer is kept like any other. Each is
 * the imported file itself, the same object `getLesson` gives (`readLesson`
 * returns what it reads).
 *
 * ```ts
 * const lessons = useSuspense(getLessons, ['caro-kann', 'slav']);
 * ```
 */
export const getLessons = new Endpoint(
  async (ids: readonly LessonId[]): Promise<Partial<Record<LessonId, Lesson>>> => {
    const loaded = await Promise.allSettled(
      ids.map(async (id) => [id, await getLesson(id)] as const),
    );
    return Object.fromEntries(
      loaded.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
    );
  },
  { name: 'getLessons', dataExpiryLength: Infinity },
);
