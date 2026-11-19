import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { Lesson } from '@/lesson/lesson';
import { indexEntry, type IndexEntry } from '@/lesson/openings';

/** Adds lesson `id` to the `LESSONS` registry in `file` (src/resources/lesson.ts) unless it is there. */
export function registerLesson(file: string, id: string) {
  const source = readFileSync(file, 'utf8');
  if (source.includes(`'${id}':`)) return;
  const entry = `  '${id}': () => import('@/assets/lessons/${id}.json'),\n`;
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
