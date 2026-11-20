// Rewrites each entry of assets/lessons/index.json from its lesson file, as
// the importer would; a lesson not yet in the index needs the importer. Run
// it after changing what an entry derives (indexEntry, or the clean-run rule
// in src/lesson/cleanRun.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { readLesson } from '@/lesson/lesson';

import { indexLesson } from './register';

const FOLDER = join(__dirname, '../../assets/lessons');
const INDEX = join(FOLDER, 'index.json');

for (const id of Object.keys(JSON.parse(readFileSync(INDEX, 'utf8')))) {
  indexLesson(INDEX, readLesson(JSON.parse(readFileSync(join(FOLDER, `${id}.json`), 'utf8'))));
}
