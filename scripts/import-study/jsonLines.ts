/**
 * The importer's caches: one JSON value per line, appended as answers arrive,
 * so a stopped run keeps what it already fetched.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
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
function writeJsonLines(file: string, values: readonly unknown[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, values.map((value) => `${JSON.stringify(value)}\n`).join(''));
  renameSync(`${file}.tmp`, file);
}

/**
 * A committed answers file (JSON lines): the answers a lesson's last import
 * used, so the next one gets the same answers instead of asking again.
 * `get` and `add` mark an answer used; `add` appends it at once, so a stopped
 * run keeps it. `saveUsed` rewrites the file with only the used answers,
 * sorted by key, so a rerun that asks the same questions writes the same file.
 */
export interface AnswersFile<Row> {
  get(key: string): Row | undefined;
  add(row: Row): void;
  saveUsed(): void;
}

/** `file` as an answers file whose rows are keyed by `keyOf`; rows `keep` refuses are left out. */
export function answersFile<Row>(
  file: string,
  keyOf: (row: Row) => string,
  keep: (row: Row) => boolean,
): AnswersFile<Row> {
  const rows = new Map<string, Row>();
  for (const row of readJsonLines(file) as Row[]) if (keep(row)) rows.set(keyOf(row), row);
  const used = new Set<string>();
  return {
    get(key) {
      const row = rows.get(key);
      if (row !== undefined) used.add(key);
      return row;
    },
    add(row) {
      const key = keyOf(row);
      rows.set(key, row);
      used.add(key);
      appendJsonLine(file, row);
    },
    saveUsed() {
      writeJsonLines(
        file,
        [...used].sort().map((key) => rows.get(key)),
      );
    },
  };
}
