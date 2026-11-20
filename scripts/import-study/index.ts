/**
 * Imports a lichess study as a lesson file (format: src/lesson/lesson.ts):
 *
 *   yarn import-study caro-kann [--no-model] [--no-popularity]
 *
 * parse the study → read each chapter's fixed formats → rewrite the comments
 * with AI (./convert) → merge the chapters into one
 * position tree → pick book moves where the guide shows moves but
 * recommends none, and (`engineCheck` in studies.ts) drop what Stockfish
 * contradicts (./engineCheck) → give notes written on another move order to
 * the position the lesson reaches (./transpositions) → add popularity → checkLesson → write
 * assets/lessons/<id>.json, register it in src/resources/lesson.ts and list
 * it in assets/lessons/index.json.
 * `caro-kann` names a study listed in studies.ts. With --no-popularity the
 * file is written without counts, replacing any it had.
 *
 * The AI step runs the Claude Code CLI (`claude`, signed in, or
 * CLAUDE_CODE_OAUTH_TOKEN set) and keeps each answer in
 * scripts/import-study/answers/<name>.jsonl, which is committed: a run asks
 * only about comments that changed (all of them after a prompt.ts edit:
 * about 190 requests and an hour for the Caro-Kann), then rewrites the file
 * with the answers it used. --no-model takes answers from the file only and
 * calls no model; comments missing there keep the importer's notes.
 *
 *   yarn import-study --popularity assets/lessons/caro-kann.json
 *
 * only recounts popularity in an existing lesson file.
 *
 * Popularity comes from the lichess opening explorer, which needs a lichess
 * token (a personal token with no scopes is enough): set LICHESS_TOKEN, or
 * run where a proxy adds it (Node's fetch uses HTTPS_PROXY only with
 * NODE_USE_ENV_PROXY=1, which the yarn script sets).
 * The study, the Wikibooks pages, the explorer's answers and Stockfish's
 * evaluations are cached in IMPORT_STUDY_CACHE (default .cache/import-study),
 * so a stopped crawl resumes. Lichess allows about 24 requests a minute, so
 * the first crawl of the Caro-Kann takes about four hours; later runs read
 * the cache.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { INITIAL_FEN } from 'chessops/fen';
import type { Color } from 'chessops/types';

import { checkLesson } from '@/lesson/check';
import { readLesson, type Lesson } from '@/lesson/lesson';

import { convertChapters, convertReport } from './convert';
import { claudeCli } from './convert/claude';
import { engineCheck, fillBook, type EngineReport } from './engineCheck';
import { extractChapter } from './extract';
import { lessonJson } from './lessonJson';
import { mergeChapters, numberedChapterName, type ChapterName, type SourceTally } from './merge';
import { addPopularity, lichessExplorer } from './popularity';
import { indexLesson, registerLesson } from './register';
import { report, sourceReport } from './report';
import { nodeStockfish } from './stockfish';
import { parseStudy, type Chapter } from './study';
import { lessonInfo, STUDIES, type ChapterSource } from './studies';
import { noteTranspositions } from './transpositions';
import { wikibooksPgn } from './wikibooks';

const ROOT = join(__dirname, '../..');

const CACHE = process.env.IMPORT_STUDY_CACHE ?? join(ROOT, '.cache/import-study');
const STUDY_FLAGS = ['--no-model', '--no-popularity'];
const USAGE = `Usage: yarn import-study <${Object.keys(STUDIES).join('|')}> ${STUDY_FLAGS.map((flag) => `[${flag}]`).join(' ')} | --popularity <lesson file>`;

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const [first, ...rest] = process.argv.slice(2);
  if (first === '--popularity') {
    if (rest.length !== 1) throw new Error(USAGE);
    const file = rest[0];
    writeLesson(file, await withPopularity(readLesson(JSON.parse(readFileSync(file, 'utf8')))));
    return;
  }
  const study = Object.hasOwn(STUDIES, first) ? STUDIES[first] : undefined;
  // An unknown flag must fail rather than be ignored: a mistyped --no-model would call the model for an hour.
  if (!study || rest.some((flag) => !STUDY_FLAGS.includes(flag))) throw new Error(USAGE);
  const info = lessonInfo(study);
  const chapters: Chapter[] = [];
  for (const [source, from] of study.from.entries()) {
    const read = await sourceChapters(from, info.side);
    chapters.push(...read.map((chapter) => ({ ...chapter, source })));
  }
  const chapterName: ChapterName = (title, chapter) => {
    const from = study.from[chapter.source ?? 0];
    // A Wikibooks chapter is titled with its variation's name, the root page's own untitled.
    return 'study' in from
      ? (from.chapterName ?? numberedChapterName)(title, chapter)
      : title || from.topName;
  };
  const cli = claudeCli({
    learner: info.side,
    cacheFile: join(ROOT, `scripts/import-study/answers/${first}.jsonl`),
    callModel: !rest.includes('--no-model'),
  });
  const converted = await convertChapters(
    chapters.map((chapter) => extractChapter(chapter, info.side)),
    cli.ask,
  );
  cli.saveUsed();
  const { extracted } = converted;
  console.log(convertReport(converted.report));
  const tally: SourceTally[] = [];
  let lesson: Lesson = mergeChapters(info, chapters, extracted, chapterName, tally);
  console.log(sourceReport(info.sources, tally));
  if (lesson.start !== INITIAL_FEN)
    throw new Error('The engine plays lines from the standard start');
  const stockfish = await nodeStockfish(join(CACHE, 'stockfish.jsonl'));
  const filled = await fillBook(lesson, stockfish.evaluate);
  lesson = filled.lesson;
  const engineFile = join(CACHE, `${lesson.id}-engine.json`);
  const { filled: booked, ended } = filled.report;
  console.log(
    `book filled: ${booked.length} moves picked where the guide recommended none, ${ended.length} lines ended where the engine overruled every move (${engineFile})`,
  );
  let engineReport: EngineReport | undefined;
  if (study.engineCheck) {
    const checked = await engineCheck(lesson, stockfish.evaluate);
    lesson = checked.lesson;
    engineReport = checked.report;
    const { unbooked, unreachable, cut, dropped } = checked.report;
    console.log(
      `engine check: ${unbooked.length} book moves overruled (${cut.length} cut, the guide's only move), ${unreachable.length} more left unreachable, ${dropped.length} notes dropped`,
    );
  }
  stockfish.stop();
  writeFileSync(engineFile, `${JSON.stringify({ ...filled.report, ...engineReport }, null, 2)}\n`);
  const transposed = noteTranspositions(lesson);
  lesson = transposed.lesson;
  console.log(
    `transpositions: ${transposed.moved} positions took the notes of a move order the lesson doesn't play`,
  );
  if (!rest.includes('--no-popularity')) lesson = await withPopularity(lesson);
  writeLesson(join(ROOT, `assets/lessons/${lesson.id}.json`), lesson);
  registerLesson(join(ROOT, 'src/resources/lesson.ts'), lesson.id);
  indexLesson(join(ROOT, 'assets/lessons/index.json'), lesson);
  console.log(report(lesson, chapters, extracted));
}

function withPopularity(lesson: Lesson): Promise<Lesson> {
  const explorer = lichessExplorer({
    token: process.env.LICHESS_TOKEN,
    cacheFile: join(CACHE, 'explorer.jsonl'),
  });
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

/** The chapters `from` gives a lesson that teaches `side`. */
async function sourceChapters(from: ChapterSource, side: Color): Promise<Chapter[]> {
  if ('study' in from) return parseStudy(await studyPgn(from.study), from.chapters);
  const pgn = await wikibooksPgn(wikibooksPage, { ...from, learner: side });
  return parseStudy(pgn, () => true);
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

/** Wikimedia's API answers 429 to shared cloud addresses; index.php's raw pages do not at this pace. */
const WIKIBOOKS_PACE_MS = 1500;
let lastWikibooksFetch = 0;

/**
 * A Wikibooks page's wiki source, downloaded once into the cache; undefined
 * when the page does not exist (cached as an empty file).
 */
async function wikibooksPage(title: string): Promise<string | undefined> {
  // Named by a hash: a title names every move, too long for a file name deep in a line.
  const file = join(CACHE, 'wikibooks', `${createHash('sha1').update(title).digest('hex')}.wiki`);
  if (!existsSync(file)) {
    const wait = lastWikibooksFetch + WIKIBOOKS_PACE_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastWikibooksFetch = Date.now();
    const url = `https://en.wikibooks.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
    const response = await fetch(url);
    if (!response.ok && response.status !== 404) {
      throw new Error(`Wikibooks answered ${response.status} for ${title}`);
    }
    mkdirSync(join(CACHE, 'wikibooks'), { recursive: true });
    writeFileSync(file, response.ok ? await response.text() : '');
  }
  return readFileSync(file, 'utf8') || undefined;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
