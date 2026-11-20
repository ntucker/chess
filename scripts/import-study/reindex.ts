// Rewrites each entry of assets/lessons/index.json from its lesson file, as
// the importer would; a lesson not yet in the index needs the importer. Run
// it after changing what an entry derives (lessonIndex, or the clean-run rule
// in src/lesson/cleanRun.ts).
import { join } from 'node:path';

import { indexedLessons, writeIndex } from './register';

const INDEX = join(__dirname, '../../assets/lessons/index.json');

writeIndex(INDEX, indexedLessons(INDEX));
