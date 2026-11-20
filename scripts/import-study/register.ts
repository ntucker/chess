import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { readLesson, type Lesson } from '@/lesson/lesson';
import { lessonIndex } from '@/lesson/openings';

/**
 * Adds lesson `id` to the `LESSONS` registry in `file` (src/resources/lesson.ts) unless it is there.
 * Writes and finds the key as Prettier formats it: quoted only when it isn't an identifier.
 */
export function registerLesson(file: string, id: string) {
  const source = readFileSync(file, 'utf8');
  const key = /^[A-Za-z_$][\w$]*$/.test(id) ? id : `'${id}'`;
  if (source.includes(`\n  ${key}:`)) return;
  const entry = `  ${key}: () => import('@/assets/lessons/${id}.json'),\n`;
  const updated = source.replace(/(export const LESSONS = \{\n(?:.*\n)*?)(\};)/, `$1${entry}$2`);
  if (updated === source) throw new Error(`Could not find LESSONS in ${file}`);
  writeFileSync(file, updated);
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
 * Adds `lesson` to the lesson index `file`, rewriting every entry from the
 * lesson files beside it: one lesson's first moves can change which moves
 * pick another of its side.
 */
export function indexLesson(file: string, lesson: Lesson) {
  const ids = [...new Set([...indexedIds(file), lesson.id])];
  writeIndex(
    file,
    ids.map((id) => (id === lesson.id ? lesson : readIndexed(file, id))),
  );
}

/** Writes the lesson index `file` for `lessons`. */
export function writeIndex(file: string, lessons: readonly Lesson[]) {
  const lines = Object.entries(lessonIndex(lessons)).map(
    ([id, entry]) => `  ${JSON.stringify(id)}: ${JSON.stringify(entry)}`,
  );
  writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
}
