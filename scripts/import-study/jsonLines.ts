/**
 * The importer's caches: one JSON value per line, appended as answers arrive,
 * so a stopped run keeps what it already fetched.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, truncateSync, writeFileSync } from 'node:fs';
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

/** Replaces `file` with `values`, all at once, so a stopped run never leaves it half-written. */
export function writeJsonLines(file: string, values: readonly unknown[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, values.map((value) => `${JSON.stringify(value)}\n`).join(''));
  renameSync(`${file}.tmp`, file);
}
