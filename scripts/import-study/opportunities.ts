/**
 * The opportunities report: runs the finder (src/opportunity) over a lesson
 * for the learner's side and writes the finds, best first, as Markdown. It
 * changes no lesson file; piece B of docs/plans/opportunities.md.
 *
 *   yarn opportunities <lesson> [--band 1400] [--top 20] [--out report.md]
 *
 * The opponent's replies come from the lichess explorer alone (which needs a
 * token, as ./index.ts says), so a thin position ends the search for mistakes; the report
 * counts where. Stockfish's searches from the app's engine in
 * Node: sketches stop at the first whole depth of `SKETCH_DEPTH`, full
 * searches are the app's (`APP_SEARCH`). Every answer is appended to the
 * lesson's own files, answers/<lesson>-opportunities-{explorer,sketch,full}.jsonl,
 * which no other step reads or prunes, so a rerun asks only about positions
 * none has seen and a stopped run resumes. Commit them.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Analysis } from '@/evaluation/evaluation';
import { lineSans, numberedLine, parsePosition, playLine } from '@/game/replay';
import { gamesPlayed } from '@/lesson/cleanRun';
import type { Lesson, Uci } from '@/lesson/lesson';
import { playedMoves } from '@/lesson/openings';
import { type Find, findOpportunities, type ThinEnd } from '@/opportunity/finder';
import { LIMITS } from '@/opportunity/limits';
import { type Answers, type Replies, repliesFrom, type Request } from '@/opportunity/walk';
import { SKETCH_DEPTH } from '@/review/order';
import { APP_SEARCH, liteStockfish } from '@/stockfish/engine';

import { answersFile } from './jsonLines';
import { lichessExplorer } from './popularity';
import { readLessonFile } from './register';
import { nodeStockfish } from './stockfish';

const ROOT = join(__dirname, '../..');
const answersPath = (id: string, kind: string) =>
  join(ROOT, `scripts/import-study/answers/${id}-opportunities-${kind}.jsonl`);

/** A sketch as its answers file keeps it. */
interface SketchRow extends Pick<Analysis, 'lines' | 'depth'> {
  readonly key: string;
}

/** The host: the finder's answers, read from the answers files, and how to get the missing ones. */
async function host(lesson: Lesson, band: number) {
  const explorer = lichessExplorer({
    token: process.env.LICHESS_TOKEN,
    cacheFile: answersPath(lesson.id, 'explorer'),
  });
  const sketches = answersFile<SketchRow>(
    answersPath(lesson.id, 'sketch'),
    (row) => row.key,
    () => true,
  );
  const engine = await nodeStockfish(answersPath(lesson.id, 'full'), APP_SEARCH);
  const replies = new Map<string, Replies>();
  const fulls = new Map<string, Analysis>();

  const answers: Answers = {
    replies: ({ key }) => replies.get(key),
    analysis: ({ key }) => {
      const sketch = sketches.get(key);
      return (
        fulls.get(key) ?? (sketch && { lines: sketch.lines, depth: sketch.depth, final: false })
      );
    },
    // The run is for `lesson.side`, so these are its book moves and every move of the erring side.
    guideMoves: ({ key }) => {
      const played = [...playedMoves(lesson, key)].sort(
        (a, b) => (gamesPlayed(b) ?? -1) - (gamesPlayed(a) ?? -1),
      );
      return played.length ? played.map((move) => move.uci) : undefined;
    },
  };

  /** The first whole depth of at least `SKETCH_DEPTH`, or the final analysis if the search ends sooner. */
  const sketch = (line: readonly Uci[]) =>
    new Promise<Analysis>((resolve, reject) => {
      let stop: (() => void) | undefined;
      let done = false;
      stop = liteStockfish.watch(line, {
        update(analysis) {
          if (done || (!analysis.final && analysis.depth < SKETCH_DEPTH)) return;
          done = true;
          resolve(analysis);
          // The watch may answer before it returns its stop.
          queueMicrotask(() => stop?.());
        },
        fail: reject,
      });
    });

  let searched = 0;
  const search = async ({ kind, spot }: Request) => {
    if (kind === 'full') fulls.set(spot.key, await engine.evaluate(spot.line, spot.key));
    else if (!sketches.get(spot.key)) {
      const { lines, depth } = await sketch(spot.line);
      sketches.add({ key: spot.key, lines, depth });
    }
    if (++searched % 50 === 0) console.log(`${searched} searches`);
  };
  const ask = async ({ spot }: Request) => {
    // The explorer's moves add up to the games reaching the position, less those that ended there.
    replies.set(spot.key, repliesFrom(await explorer.ask(spot.key, band), LIMITS.minGames));
  };

  /**
   * Gets every missing answer: the explorer's one at a time (it is paced),
   * Stockfish's one at a time beside them (it searches one position at a time).
   */
  const answer = async (requests: readonly Request[]) => {
    const each = async (wanted: readonly Request[], get: (request: Request) => Promise<void>) => {
      for (const request of wanted) await get(request);
    };
    await Promise.all([
      each(
        requests.filter(({ kind }) => kind === 'replies'),
        ask,
      ),
      each(
        requests.filter(({ kind }) => kind !== 'replies'),
        search,
      ),
    ]);
  };

  return { answers, answer, stop: engine.stop };
}

async function run(id: string, band: number, top: number, out: string | undefined) {
  const lesson = readLessonFile(join(ROOT, `assets/lessons/${id}.json`));
  const { answers, answer, stop } = await host(lesson, band);
  const input = { start: lesson.start, line: [], side: lesson.side, answers };
  let result = findOpportunities(input);
  for (let round = 1; result.requests.length; round++) {
    console.log(`round ${round}: ${result.requests.length} answers to get`);
    await answer(result.requests);
    result = findOpportunities(input);
  }
  stop();
  const report = reportOf(
    lesson,
    band,
    result.finds.slice(0, top),
    result.finds.length,
    result.thin,
  );
  if (out) writeFileSync(out, report);
  else console.log(report);
}

/** The finds as a Markdown report: one table row each, then each line in full. */
function reportOf(
  lesson: Lesson,
  band: number,
  finds: readonly Find[],
  total: number,
  thin: readonly ThinEnd[],
): string {
  const start = parsePosition(lesson.start)!;
  const percent = (share: number) => `${Math.round(share * 100)}%`;
  const sans = (line: readonly Uci[]) => lineSans(line, start);
  const numbered = (from: readonly Uci[], moves: readonly Uci[]) =>
    numberedLine(sans([...from, ...moves]).slice(from.length), from.length + 1);
  const inGuide = (find: Find) => {
    const key = [...playLine(find.line, start.clone())].at(-1)!.key;
    return lesson.positions[key]?.moves.some((move) => move.uci === find.mistake) ? 'yes' : 'no';
  };
  const rows = finds.map((find, rank) => {
    const cue = [...find.line, find.mistake];
    return [
      rank + 1,
      numbered([], find.line) || '(start)',
      numbered(find.line, [find.mistake]),
      percent(find.share),
      Math.round(find.cost * 100),
      percent(find.reach),
      find.found === undefined ? '?' : percent(find.found),
      (find.score * 1000).toFixed(1),
      find.replies.map((reply) => numbered(cue, [reply])).join(', '),
      numbered([...cue, find.replies[0]], find.payoff),
      inGuide(find),
    ].join(' | ');
  });
  return [
    `# Opportunities in ${lesson.title}, lichess ${band} band`,
    '',
    `${total} finds; the best ${finds.length} below. Share: how often the opponent plays the mistake there. Cost: points of expected score it gives away (of 100). Reach: how often games get there. Found: how often players there find a punishing reply. Score: reach × share × cost, in thousandths. In guide: whether the lesson already lists the mistake.`,
    '',
    `Limits: ${Object.entries(LIMITS)
      .map(([name, value]) => `${name} ${value}`)
      .join(', ')} (src/opportunity/limits.ts).`,
    '',
    '| # | After | Mistake | Share | Cost | Reach | Found | Score | Punish with | Then | In guide |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row} |`),
    '',
    thinSummary(thin, percent),
    '',
  ].join('\n');
}

/** Where the walk ended thin: how many positions, at which plies, and how many games reach them. */
function thinSummary(thin: readonly ThinEnd[], percent: (share: number) => string): string {
  if (!thin.length) return 'No walk ended at a thin position.';
  const byPly = new Map<number, number>();
  for (const { line } of thin) byPly.set(line.length, (byPly.get(line.length) ?? 0) + 1);
  const plies = [...byPly]
    .sort(([a], [b]) => a - b)
    .map(([ply, count]) => `ply ${ply}: ${count}`)
    .join(', ');
  const reach = thin.reduce((sum, end) => sum + end.reach, 0);
  return `Thin: ${thin.length} walks ended where fewer than ${LIMITS.minGames} games reach the position (${plies}), ${percent(reach)} of games in all.`;
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
};
const [id] = args;
if (!id || id.startsWith('--')) {
  console.error('Usage: yarn opportunities <lesson> [--band 1400] [--top 20] [--out report.md]');
  process.exit(1);
}
run(id, Number(flag('band') ?? 1400), Number(flag('top') ?? 20), flag('out')).catch(
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
