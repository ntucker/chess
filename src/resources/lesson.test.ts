import { describe, expect, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { checkLesson } from '@/lesson/check';
import { readLesson } from '@/lesson/lesson';

import { LESSONS } from './lesson';

// Read from disk: Jest can't run the registry's import() without
// --experimental-vm-modules.
const folder = join(__dirname, '../../assets/lessons');
const ids = readdirSync(folder)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

describe('shipped lessons', () => {
  it('registers every file in assets/lessons', () => {
    expect(Object.keys(LESSONS).sort()).toEqual(ids.sort());
  });

  it.each(ids)('%s passes the rules checker', (id) => {
    const lesson = readLesson(JSON.parse(readFileSync(join(folder, `${id}.json`), 'utf8')));
    expect(lesson.id).toBe(id);
    expect(checkLesson(lesson)).toEqual([]);
  });
});
