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

import { type Analysis, SKETCH_DEPTH } from '@/evaluation/evaluation';
import { lineSans, numberedLine, parsePosition, playLine, readPositionKey } from '@/game/replay';
import { gamesPlayed, inCleanRun } from '@/lesson/cleanRun';
import type { Lesson, Uci } from '@/lesson/lesson';
import {
  type Find,
  findOpportunities,
  type FinderResult,
  type ThinEnd,
} from '@/opportunity/finder';
import { LIMITS, MIN_GAMES } from '@/opportunity/limits';
import { type Answers, type Replies, repliesFrom, type Request } from '@/opportunity/walk';
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
      const learner = readPositionKey(key)!.turn === lesson.side;
      const moves = lesson.positions[key]?.moves ?? [];
      const played = moves
        .filter((move) => inCleanRun(move, learner))
        .sort((a, b) => (gamesPlayed(b) ?? -1) - (gamesPlayed(a) ?? -1));
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
    replies.set(spot.key, repliesFrom(await explorer.ask(spot.key, band), MIN_GAMES));
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
  const report = reportOf(lesson, band, result, top, [
    thinSummary(result.thin),
    guideSummary(lesson, [...result.finds, ...result.dropped], answers),
  ]);
  if (out) writeFileSync(out, report);
  else console.log(report);
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

const points = (score: number) => Math.round(score * 100);

/** The finds as a Markdown report: the best `top` kept ones, then every dropped one. */
function reportOf(
  lesson: Lesson,
  band: number,
  { finds, dropped }: FinderResult,
  top: number,
  summaries: readonly string[],
): string {
  const start = parsePosition(lesson.start)!;
  const sans = (line: readonly Uci[]) => lineSans(line, start);
  const numbered = (from: readonly Uci[], moves: readonly Uci[]) =>
    numberedLine(sans([...from, ...moves]).slice(from.length), from.length + 1);
  const inGuide = (find: Find) => {
    const key = [...playLine(find.line, start.clone())].at(-1)!.key;
    return lesson.positions[key]?.moves.some((move) => move.uci === find.mistake) ? 'yes' : 'no';
  };
  const row = (find: Find, rank: number) => {
    const cue = [...find.line, find.mistake];
    const cells = [
      rank + 1,
      numbered([], find.line) || '(start)',
      numbered(find.line, [find.mistake]),
      percent(find.share),
      percent(find.reach),
      points(find.cost),
      find.found === undefined ? '?' : percent(find.found),
      `${find.estimate ? '~' : ''}${points(find.gain)}`,
      (find.score * 1000).toFixed(2),
      points(find.end),
      find.holds ? 'holds' : 'practical',
      find.replies.map((reply) => numbered(cue, [reply])).join(', '),
      numbered([...cue, find.replies[0]], find.payoff),
      inGuide(find),
    ];
    return `| ${cells.join(' | ')} |`;
  };
  const header = [
    '| # | After | Mistake | Share | Reach | Cost | Found | Gain | Score | End | Holds | Punish with | Then | In guide |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  return [
    `# Opportunities in ${lesson.title}, lichess ${band} band`,
    '',
    `${finds.length} finds kept; the best ${Math.min(top, finds.length)} below, then the ${dropped.length} dropped. Share: how often the opponent plays the mistake there. Reach: how often games get there. Cost: points of expected score (of 100) the mistake gives away. Found: how often players at the cue find a punishing reply. Gain: points a player at the cue scores more by knowing the punishment than by playing as the band does (~: an estimate, the cue is thin or its measured replies cover under ${percent(LIMITS.estimateCoverage)} of its games). Score: reach × share × gain, in thousandths, which ranks. End: the learner's expected score where Act III ends, following the band's likely replies. Holds: the best reply alone keeps the learner at least ${points(LIMITS.keepScore)} against best defence; practical: only the band's likely replies get there. In guide: whether the lesson already lists the mistake.`,
    '',
    `Limits: minGames ${MIN_GAMES}, ${Object.entries(LIMITS)
      .map(([name, value]) => `${name} ${value}`)
      .join(', ')} (src/opportunity/limits.ts).`,
    '',
    ...header,
    ...finds.slice(0, top).map(row),
    '',
    `## Dropped: Act III ends under ${points(LIMITS.keepScore)}`,
    '',
    ...(dropped.length ? [...header, ...dropped.map(row)] : ['None.']),
    '',
    ...summaries,
    '',
  ].join('\n');
}

/** Where the walk ended thin: how many positions, at which plies, and how many games reach them. */
function thinSummary(thin: readonly ThinEnd[]): string {
  if (!thin.length) return 'No walk ended at a thin position.';
  const byPly = new Map<number, number>();
  for (const { line } of thin) byPly.set(line.length, (byPly.get(line.length) ?? 0) + 1);
  const plies = [...byPly]
    .sort(([a], [b]) => a - b)
    .map(([ply, count]) => `ply ${ply}: ${count}`)
    .join(', ');
  const reach = thin.reduce((sum, end) => sum + end.reach, 0);
  return `Thin: ${thin.length} walks ended where fewer than ${MIN_GAMES} games reach the position (${plies}), ${percent(reach)} of games in all.`;
}

/**
 * Where the guide and Stockfish name different moves for the punishing side
 * in Act III, and how often Act III kept the guide's (it gives back less
 * than the cost floor there). Each override is listed: the guide's own book
 * move costs a mistake's worth there, so a person looks at it before merge.
 */
function guideSummary(lesson: Lesson, finds: readonly Find[], answers: Answers): string {
  const start = parsePosition(lesson.start)!;
  let differ = 0;
  const overrides: string[] = [];
  for (const find of finds) {
    const line = [...find.line, find.mistake, find.replies[0], ...find.payoff];
    const from = find.line.length + 2;
    const steps = [...playLine(line, start.clone())].map(({ pos, key }) => ({
      turn: pos.turn,
      key,
    }));
    for (let ply = from; ply < line.length; ply++) {
      const { turn, key } = steps[ply];
      if (turn !== lesson.side) continue;
      const spot = { line: line.slice(0, ply), key };
      const guide = answers.guideMoves?.(spot)?.[0];
      if (!guide || guide === answers.analysis(spot)?.lines[0]?.uci) continue;
      differ++;
      if (line[ply] === guide) continue;
      const sans = lineSans([...spot.line, guide], start);
      overrides.push(
        `- ${numberedLine(sans.slice(0, -1))}: the guide's ${sans.at(-1)}, Act III plays ${lineSans(line.slice(0, ply + 1), start).at(-1)}`,
      );
    }
  }
  if (!differ)
    return "Act III: the guide never differs from Stockfish's best for the punishing side.";
  const summary = `Act III: the guide and Stockfish differ at ${differ} of the punishing side's positions; Act III kept the guide's move at ${differ - overrides.length}.`;
  return overrides.length
    ? [
        summary,
        '',
        "Overrides (the guide's move gives back a mistake's worth; check before merge):",
        ...overrides,
      ].join('\n')
    : summary;
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
