import type { Lesson } from '@/lesson/lesson';

/** `lesson` as JSON with one position per line, so a rerun's diff shows only the positions that changed. */
export function lessonJson({ positions, ...rest }: Lesson): string {
  const lines = Object.entries(positions).map(([key, entry]) => `${JSON.stringify(key)}:${JSON.stringify(entry)}`);
  // The fields before `positions`, without the closing brace.
  const head = JSON.stringify(rest).slice(0, -1);
  return `${head},"positions":{\n${lines.join(',\n')}\n}}\n`;
}
