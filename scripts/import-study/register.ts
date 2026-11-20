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

/**
 * Writes the lesson index `file` (assets/lessons/index.json) with `lesson`
 * in it, rewriting every entry from the lesson files beside it: one lesson's
 * first moves can change which moves pick another of its side.
 */
export function indexLesson(file: string, lesson: Lesson) {
  const ids: string[] = existsSync(file) ? Object.keys(JSON.parse(readFileSync(file, 'utf8'))) : [];
  const lessons = [...new Set([...ids, lesson.id])].map((id) =>
    id === lesson.id
      ? lesson
      : readLesson(JSON.parse(readFileSync(join(dirname(file), `${id}.json`), 'utf8'))),
  );
  const lines = Object.entries(lessonIndex(lessons)).map(
    ([id, entry]) => `  ${JSON.stringify(id)}: ${JSON.stringify(entry)}`,
  );
  writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
}
