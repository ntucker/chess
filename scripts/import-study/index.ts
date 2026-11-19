/**
 * Imports a lichess study as a lesson file (format: src/lesson/lesson.ts):
 *
 *   yarn import-study caro-kann [--no-convert] [--no-popularity]
 *
 * parse the study → read each chapter's fixed formats → rewrite the comments
 * with AI (./convert, skipped with --no-convert) → merge the chapters into one
 * position tree → add popularity → checkLesson → write
 * assets/lessons/<id>.json and register it in src/resources/lesson.ts.
 * `caro-kann` names a study listed in studies.ts. With --no-popularity the
 * file is written without counts, replacing any it had.
 *
 * The AI step runs the Claude Code CLI (`claude`, signed in, or
 * CLAUDE_CODE_OAUTH_TOKEN set) and caches each answer in
 * IMPORT_STUDY_CACHE/convert.jsonl: the first Caro-Kann run asks about 190
 * requests (about an hour); later runs ask only about changed comments.
 *
 *   yarn import-study --popularity assets/lessons/caro-kann.json
 *
 * only recounts popularity in an existing lesson file.
 *
 * Popularity comes from the lichess opening explorer, which needs a lichess
 * token (a personal token with no scopes is enough): set LICHESS_TOKEN, or
 * run where a proxy adds it (Node's fetch uses HTTPS_PROXY only with
 * NODE_USE_ENV_PROXY=1, which the yarn script sets).
 * Answers are cached in IMPORT_STUDY_CACHE (default .cache/import-study), so
 * a stopped crawl resumes. Lichess allows about 24 requests a minute, so the
 * first crawl of the Caro-Kann takes about four hours; later runs read the
 * cache.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { checkLesson } from '@/lesson/check';
import { readLesson, type Lesson } from '@/lesson/lesson';

import { convertChapters, convertReport } from './convert';
import { claudeCli } from './convert/claude';
import { extractChapter } from './extract';
import { lessonJson } from './lessonJson';
import { mergeChapters } from './merge';
import { addPopularity, lichessExplorer } from './popularity';
import { registerLesson } from './register';
import { report } from './report';
import { parseStudy } from './study';
import { STUDIES } from './studies';

const ROOT = join(__dirname, '../..');

const CACHE = process.env.IMPORT_STUDY_CACHE ?? join(ROOT, '.cache/import-study');
const USAGE = `Usage: yarn import-study <${Object.keys(STUDIES).join('|')}> [--no-convert] [--no-popularity] | --popularity <lesson file>`;

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const [first, ...rest] = process.argv.slice(2);
  if (first === '--popularity' && rest[0]) {
    const file = rest[0];
    writeLesson(file, await withPopularity(readLesson(JSON.parse(readFileSync(file, 'utf8')))));
    return;
  }
  const study = Object.hasOwn(STUDIES, first) ? STUDIES[first as keyof typeof STUDIES] : undefined;
  if (!study) throw new Error(USAGE);
  const chapters = parseStudy(await studyPgn(study.study), study.chapters);
  let extracted = chapters.map((chapter) => extractChapter(chapter, study.info.side));
  if (!rest.includes('--no-convert')) {
    const ask = claudeCli({ learner: study.info.side, cacheFile: join(CACHE, 'convert.jsonl') });
    const converted = await convertChapters(extracted, ask);
    extracted = converted.extracted;
    console.log(convertReport(converted.report));
  }
  let lesson: Lesson = mergeChapters(study.info, chapters, extracted);
  if (!rest.includes('--no-popularity')) lesson = await withPopularity(lesson);
  writeLesson(join(ROOT, `assets/lessons/${lesson.id}.json`), lesson);
  registerLesson(join(ROOT, 'src/resources/lesson.ts'), lesson.id);
  console.log(report(lesson, chapters, extracted));
}

function withPopularity(lesson: Lesson): Promise<Lesson> {
  const explorer = lichessExplorer({ token: process.env.LICHESS_TOKEN, cacheFile: join(CACHE, 'explorer.jsonl') });
  const date = new Date().toISOString().slice(0, 10);
  return addPopularity(lesson, explorer, date, (asked) => {
    if (asked % 50 === 0) console.log(`popularity: ${asked} positions`);
  });
}

/** Writes `lesson` to `file`, refusing one the checker finds fault with. */
function writeLesson(file: string, lesson: Lesson) {
  const problems = checkLesson(lesson);
  if (problems.length > 0) {
    console.error(problems.slice(0, 20));
    throw new Error(`${problems.length} problems: the importer made a lesson the checker refuses`);
  }
  const json = lessonJson(lesson);
  writeFileSync(file, json);
  console.log(`wrote ${file}: ${Buffer.byteLength(json)} bytes`);
}

/** The study's PGN, downloaded once into the cache. */
async function studyPgn(studyId: string): Promise<string> {
  const file = join(CACHE, `${studyId}.pgn`);
  if (!existsSync(file)) {
    const response = await fetch(`https://lichess.org/api/study/${studyId}.pgn`);
    if (!response.ok) throw new Error(`lichess answered ${response.status} for study ${studyId}`);
    writeFileSync(file, await response.text());
  }
  return readFileSync(file, 'utf8');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
