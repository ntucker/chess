/**
 * The importer's caches: one JSON value per line, appended as answers arrive,
 * so a stopped run keeps what it already fetched.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, truncateSync } from 'node:fs';
import { dirname } from 'node:path';

/** Every value in `file`. A last line a stopped run left half-written is cut off. */
export function readJsonLines(file: string): unknown[] {
  if (!existsSync(file)) return [];
  const data = readFileSync(file);
  const whole = data.lastIndexOf('\n') + 1;
  if (whole < data.length) truncateSync(file, whole);
  return data
    .subarray(0, whole)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
}

export function appendJsonLine(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(value)}\n`);
}
