import type { Lesson } from '@/lesson/lesson';

/** `lesson` as JSON with one position per line, so a rerun's diff shows only the positions that changed. */
export function lessonJson({ positions, ...rest }: Lesson): string {
  const lines = Object.entries(positions).map(([key, entry]) => `${JSON.stringify(key)}:${JSON.stringify(entry)}`);
  const head = Object.entries(rest).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`);
  return `{${head.join(',')},"positions":{\n${lines.join(',\n')}\n}}\n`;
}
