import { Endpoint } from '@data-client/rest';
import { createContext } from 'react';

import INDEX from '@/assets/lessons/index.json';
import { explainLoadFailure } from '@/files/newVersion';
import { readLesson } from '@/lesson/lesson';
import type { LessonIndex } from '@/lesson/openings';

/**
 * Every lesson the app ships, by id: one static JSON file each, loaded only
 * when asked for. Metro needs a literal path in each `import()`.
 */
export const LESSONS = {
  'caro-kann': () => import('@/assets/lessons/caro-kann.json'),
  slav: () => import('@/assets/lessons/slav.json'),
  'anti-london': () => import('@/assets/lessons/anti-london.json'),
  london: () => import('@/assets/lessons/london.json'),
  'ruy-lopez': () => import('@/assets/lessons/ruy-lopez.json'),
  sicilian: () => import('@/assets/lessons/sicilian.json'),
  'bc4-system': () => import('@/assets/lessons/bc4-system.json'),
  albin: () => import('@/assets/lessons/albin.json'),
  'open-game': () => import('@/assets/lessons/open-game.json'),
  'queens-gambit': () => import('@/assets/lessons/queens-gambit.json'),
};

export type LessonId = keyof typeof LESSONS;

/**
 * What the start position shows of each lesson before it loads, in the order
 * it lists them (src/lesson/openings.ts). The importer writes it beside the
 * lesson files, and src/resources/lesson.test.ts holds it to them.
 */
export const LESSON_INDEX = INDEX as LessonIndex<LessonId>;

/**
 * The lesson index the openings page reads: `LESSON_INDEX`, unless a
 * provider gives another. Tests give a small fixture index
 * (src/lesson/openings.fixture.ts), so a new lesson changes none of them.
 * It stands in for the index alone: `getLesson` still loads shipped files.
 *
 * ```ts
 * const index = use(LessonIndexContext);
 * ```
 */
export const LessonIndexContext = createContext(LESSON_INDEX);

/**
 * The lesson for one opening (see src/lesson/lesson.ts). It ships with the
 * app and never changes, so it is kept for as long as the app runs. On the
 * web its file loads when asked for, and fails with a NewVersionError once
 * a newer deploy has removed it.
 *
 * ```ts
 * const lesson = useSuspense(getLesson, 'caro-kann');
 * ```
 */
export const getLesson = new Endpoint(
  async (id: LessonId) => {
    const file = await LESSONS[id]().catch(async (error: unknown) => {
      throw await explainLoadFailure(error);
    });
    return readLesson(file.default);
  },
  { name: 'getLesson', dataExpiryLength: Infinity },
);
