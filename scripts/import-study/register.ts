import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { Lesson } from '@/lesson/lesson';
import { indexEntry, type IndexEntry } from '@/lesson/openings';

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

/** Writes `lesson`'s entry in the lesson index `file` (assets/lessons/index.json), keeping the others. */
export function indexLesson(file: string, lesson: Lesson) {
  const index: Record<string, IndexEntry> = existsSync(file)
    ? JSON.parse(readFileSync(file, 'utf8'))
    : {};
  index[lesson.id] = indexEntry(lesson);
  const lines = Object.entries(index).map(
    ([id, entry]) => `  ${JSON.stringify(id)}: ${JSON.stringify(entry)}`,
  );
  writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
}
