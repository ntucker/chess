import { readFileSync, writeFileSync } from 'node:fs';

/** Adds lesson `id` to the `LESSONS` registry in `file` (src/resources/lesson.ts) unless it is there. */
export function registerLesson(file: string, id: string) {
  const source = readFileSync(file, 'utf8');
  if (source.includes(`'${id}':`)) return;
  const entry = `  '${id}': () => import('@/assets/lessons/${id}.json'),\n`;
  const updated = source.replace(/(export const LESSONS = \{\n(?:.*\n)*?)(\};)/, `$1${entry}$2`);
  if (updated === source) throw new Error(`Could not find LESSONS in ${file}`);
  writeFileSync(file, updated);
}
