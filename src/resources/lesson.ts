import { Endpoint } from '@data-client/rest';

import { readLesson } from '@/lesson/lesson';

/**
 * Every lesson the app ships, by id: one static JSON file each, loaded only
 * when asked for. Metro needs a literal path in each `import()`.
 */
export const LESSONS = {
  'caro-kann-sample': () => import('@/assets/lessons/caro-kann-sample.json'),
};

export type LessonId = keyof typeof LESSONS;

/**
 * The lesson for one opening (see src/lesson/lesson.ts). It ships with the
 * app and never changes, so it is kept for as long as the app runs.
 *
 * ```ts
 * const lesson = useSuspense(getLesson, 'caro-kann-sample');
 * ```
 */
export const getLesson = new Endpoint(
  async (id: LessonId) => readLesson((await LESSONS[id]()).default),
  { name: 'getLesson', dataExpiryLength: Infinity },
);
