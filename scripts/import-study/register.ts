import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { readLesson, type Lesson } from '@/lesson/lesson';
import type { LessonIndex } from '@/lesson/openings';

/**
 * `source` (src/resources/lesson.ts) with lesson `id` in its `LESSONS`
 * registry, added unless it is there; throws when it has no registry, before
 * the importer writes anything. Writes and finds the key as Prettier formats
 * it: quoted only when it isn't an identifier.
 */
export function registered(source: string, id: string): string {
  const key = /^[A-Za-z_$][\w$]*$/.test(id) ? id : `'${id}'`;
  if (source.includes(`\n  ${key}:`)) return source;
  const entry = `  ${key}: () => import('@/assets/lessons/${id}.json'),\n`;
  const updated = source.replace(/(export const LESSONS = \{\n(?:.*\n)*?)(\};)/, `$1${entry}$2`);
  if (updated === source) throw new Error('Could not find LESSONS in the lesson registry');
  return updated;
}

/** The lesson in the JSON file `path`, checked as `readLesson` checks it. */
export const readLessonFile = (path: string) => readLesson(JSON.parse(readFileSync(path, 'utf8')));

/** The ids the lesson index `file` (assets/lessons/index.json) lists, in its order. */
const indexedIds = (file: string): string[] =>
  existsSync(file) ? Object.keys(JSON.parse(readFileSync(file, 'utf8'))) : [];

/** Lesson `id`, read from its file beside the lesson index `file`. */
const readIndexed = (file: string, id: string) => readLessonFile(join(dirname(file), `${id}.json`));

/** The lessons the lesson index `file` lists, in its order, read from the files beside it. */
export const indexedLessons = (file: string) => indexedIds(file).map((id) => readIndexed(file, id));

/**
 * The lessons the lesson index `file` lists, with `lesson` in place of its
 * file or added at the end: indexing them rewrites every entry, since one
 * lesson's first moves can change which moves pick another of its side.
 */
export function indexedWith(file: string, lesson: Lesson): Lesson[] {
  const ids = [...new Set([...indexedIds(file), lesson.id])];
  return ids.map((id) => (id === lesson.id ? lesson : readIndexed(file, id)));
}

/** Writes `index` as the lesson index `file`, one entry a line. */
export function writeIndex(file: string, index: LessonIndex) {
  const lines = Object.entries(index).map(
    ([id, entry]) => `  ${JSON.stringify(id)}: ${JSON.stringify(entry)}`,
  );
  writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
}
