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
 * the position the lesson reaches (./transpositions) → write the idea of each
 * book move nothing explains with AI (./explain) → add popularity → checkLesson → write
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
 * with the answers it used. The explain step keeps its answers the same way in
 * scripts/import-study/answers/<name>-explain.jsonl. --no-model takes answers
 * from the files only and calls no model; comments missing there keep the
 * importer's notes, and book moves missing there stay unexplained.
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
import type { Lesson } from '@/lesson/lesson';
import { lessonIndex } from '@/lesson/openings';

import { convertChapters, convertReport } from './convert';
import { claudeCli } from './convert/claude';
import { engineCheck, ENGINES_OWN, fillBook, type EngineReport } from './engineCheck';
import { explainBookMoves, explainCli, explainReport } from './explain';
import { extractChapter } from './extract';
import { lessonJson } from './lessonJson';
import { mergeChapters, numberedChapterName, type ChapterName, type SourceTally } from './merge';
import { addPopularity, lichessExplorer } from './popularity';
import { indexedWith, readLessonFile, registered, writeIndex } from './register';
import { report, sourceReport } from './report';
import { nodeStockfish } from './stockfish';
import { parseStudy, withoutLeadComments, withoutLines, withReplies, type Chapter } from './study';
import {
  credit,
  lessonInfo,
  STUDIES,
  type ChapterSource,
  type StudySource,
  type WikibooksSource,
} from './studies';
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
    writeLesson(file, checked(await withPopularity(readLessonFile(file))));
    return;
  }
  const study = Object.hasOwn(STUDIES, first) ? STUDIES[first] : undefined;
  // An unknown flag must fail rather than be ignored: a mistyped --no-model would call the model for an hour.
  if (!study || rest.some((flag) => !STUDY_FLAGS.includes(flag))) throw new Error(USAGE);
  const info = lessonInfo(study);
  const chapters: Chapter[] = [];
  for (const [source, from] of study.from.entries()) {
    const read = await sourceChapters(from, info.side);
    const lichess = 'study' in from ? from : undefined;
    const writtenFor = lichess?.writtenFor !== info.side ? lichess?.writtenFor : undefined;
    const recommends = writtenFor && lichess?.recommends;
    // A study named only from a ply on leaves the moves before to other sources' chapters (`cut`).
    const namedFrom = lichess?.namedFrom;
    chapters.push(
      ...read.map((chapter) => ({
        ...chapter,
        source,
        ...(writtenFor && { writtenFor }),
        ...(recommends && { recommends }),
        ...(namedFrom && { namedFrom, cut: true }),
      })),
    );
  }
  const chapterName: ChapterName = (title, chapter) => {
    const from = study.from[chapter.source ?? 0];
    // A Wikibooks chapter is titled with its variation's name, the opening's own untitled.
    return 'study' in from
      ? (from.chapterName ?? numberedChapterName)(title, chapter)
      : title || undefined;
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
  // Tallies go by each source's place in the recipe, which can list a study twice; the lesson credits it once.
  console.log(sourceReport(study.from.map(credit), tally));
  if (lesson.start !== INITIAL_FEN)
    throw new Error('The engine plays lines from the standard start');
  const stockfish = await nodeStockfish(join(CACHE, 'stockfish.jsonl'));
  const filled = await fillBook(lesson, stockfish.evaluate);
  lesson = filled.lesson;
  const engineFile = join(CACHE, `${lesson.id}-engine.json`);
  const { filled: booked, ended } = filled.report;
  const enginesOwn = booked.filter(({ why }) => why === ENGINES_OWN).length;
  console.log(
    `book filled: ${booked.length} moves picked where the guide recommended none (${enginesOwn} the engine's own, no guide's), ${ended.length} lines ended where the engine overruled every move and named none (${engineFile})`,
  );
  let engineReport: EngineReport | undefined;
  if (study.engineCheck) {
    const checked = await engineCheck(lesson, stockfish.evaluate, {
      gambit: study.engineCheck === 'gambit',
    });
    lesson = checked.lesson;
    engineReport = checked.report;
    const { gambits, unbooked, unreachable, cut, dropped, refilled } = checked.report;
    console.log(
      `engine check: ${gambits.length} gambit mistakes kept, ${unbooked.length} book moves overruled (${cut.length} cut, the guide's only move; ${refilled.filled.length} picked again among the guide's others, ${refilled.ended.length} ended where it overruled them all and named none), ${unreachable.length} more left unreachable, ${dropped.length} notes dropped`,
    );
  }
  writeFileSync(engineFile, `${JSON.stringify({ ...filled.report, ...engineReport }, null, 2)}\n`);
  const transposed = noteTranspositions(lesson);
  lesson = transposed.lesson;
  console.log(
    `transpositions: ${transposed.moved} positions took the notes of a move order the lesson doesn't play`,
  );
  const explainer = explainCli({
    learner: info.side,
    cacheFile: join(ROOT, `scripts/import-study/answers/${first}-explain.jsonl`),
    callModel: !rest.includes('--no-model'),
  });
  const explained = await explainBookMoves(lesson, explainer.ask, stockfish.evaluate);
  explainer.saveUsed();
  lesson = explained.lesson;
  console.log(explainReport(explained.report));
  stockfish.stop();
  if (!rest.includes('--no-popularity')) lesson = await withPopularity(lesson);
  // The checker, the index and the registry each refuse a lesson by throwing, so all come before any
  // write: a lesson file written without its registry entry or index line fails lesson.test.ts.
  checked(lesson);
  const indexFile = join(ROOT, 'assets/lessons/index.json');
  const index = lessonIndex(indexedWith(indexFile, lesson));
  const registryFile = join(ROOT, 'src/resources/lesson.ts');
  const registry = registered(readFileSync(registryFile, 'utf8'), lesson.id);
  writeLesson(join(ROOT, `assets/lessons/${lesson.id}.json`), lesson);
  writeFileSync(registryFile, registry);
  writeIndex(indexFile, index);
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

/** `lesson`, once the checker passes it; throws with its first problems otherwise. */
function checked(lesson: Lesson): Lesson {
  const problems = checkLesson(lesson);
  if (problems.length > 0) {
    console.error(problems.slice(0, 20));
    throw new Error(`${problems.length} problems: the importer made a lesson the checker refuses`);
  }
  return lesson;
}

/** Writes `lesson`, which `checked` has passed, to `file`. */
function writeLesson(file: string, lesson: Lesson) {
  const json = lessonJson(lesson);
  writeFileSync(file, json);
  console.log(`wrote ${file}: ${Buffer.byteLength(json)} bytes`);
}

/** The chapters `from` gives a lesson that teaches `side`, with the replies it names in words. */
async function sourceChapters(from: ChapterSource, side: Color): Promise<Chapter[]> {
  const chapters =
    'study' in from ? await studyChapters(from) : await wikibooksChapters(from, side);
  return from.replies ? withReplies(chapters, from.replies) : chapters;
}

async function studyChapters(from: StudySource): Promise<Chapter[]> {
  const pgn = from.file
    ? readFileSync(join(ROOT, 'scripts/import-study/sources', from.file), 'utf8')
    : await studyPgn(from.study);
  const read = parseStudy(pgn, from.chapters);
  const kept = from.leave ? withoutLines(read, from.leave) : read;
  return from.namedFrom ? withoutLeadComments(kept, from.namedFrom) : kept;
}

async function wikibooksChapters(from: WikibooksSource, side: Color): Promise<Chapter[]> {
  const { replies: _replies, ...options } = from;
  return parseStudy(await wikibooksPgn(wikibooksPage, { ...options, learner: side }), () => true);
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
const WIKIBOOKS_TRIES = 6;
let lastWikibooksFetch = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A Wikibooks page's wiki source, downloaded once into the cache; undefined
 * when the page does not exist (cached as an empty file).
 */
async function wikibooksPage(title: string): Promise<string | undefined> {
  // Named by a hash: a title names every move, too long for a file name deep in a line.
  const file = join(CACHE, 'wikibooks', `${createHash('sha1').update(title).digest('hex')}.wiki`);
  if (!existsSync(file)) {
    const url = `https://en.wikibooks.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
    let response: Response;
    // Wikibooks still answers 429 after about 50 pages from a shared cloud address: wait and try again.
    for (let attempt = 1; ; attempt++) {
      const wait = lastWikibooksFetch + WIKIBOOKS_PACE_MS - Date.now();
      if (wait > 0) await sleep(wait);
      lastWikibooksFetch = Date.now();
      response = await fetch(url);
      if (response.status !== 429 || attempt === WIKIBOOKS_TRIES) break;
      console.log(`Wikibooks answered 429 for ${title}: trying again in ${attempt * 30} s`);
      await sleep(attempt * 30_000);
    }
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
