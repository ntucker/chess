/**
 * The opportunities report: runs the finder (src/opportunity) and writes the
 * finds, best first, as Markdown. It changes no lesson file; piece B of
 * docs/plans/opportunities.md.
 *
 *   yarn opportunities <lesson> [--band 1400] [--top 20] [--out report.md]
 *   yarn opportunities --from "1.e4 e5 2.Nf3 Nf6" --side black [--band 1400] [--top 20] [--out report.md]
 *
 * With a lesson it runs from the lesson's start for the lesson's side, and
 * splits the finds the guide's moves reach from those it doesn't. With
 * `--from` it runs from the position after those moves (SAN or UCI, from the
 * standard start; move numbers optional) with no lesson, for `--side`, the
 * side looking for opportunities, so every find is off the guide.
 *
 * Its answers come from its own answers files and lichess and Stockfish
 * (./finderHost.ts), so a rerun asks only about positions none has seen: a
 * lesson's are committed beside its other answers, a run from moves shares a
 * cache git ignores. A thin position ends the search for mistakes; the report
 * counts where.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Chess } from 'chessops/chess';
import { INITIAL_FEN } from 'chessops/fen';

import { percent } from '@/analysis/quality';
import {
  type Color,
  colorName,
  lineSans,
  numberedLine,
  parsePosition,
  playLine,
  playMove,
  recordedMove,
  sanToUci,
} from '@/game/replay';
import type { Lesson, Uci } from '@/lesson/lesson';
import { type Find, type FinderResult, type ThinEnd } from '@/opportunity/finder';
import { LIMITS, MIN_GAMES } from '@/opportunity/limits';
import { keepsGuide } from '@/opportunity/payoff';

import { FIND_BAND, finderHost, positionHost, runFinder } from './finderHost';
import { readLessonFile } from './register';

const ROOT = join(__dirname, '../..');

interface Options {
  readonly band: number;
  readonly top: number;
  readonly out: string | undefined;
}

async function reportLesson(id: string, { band, top, out }: Options) {
  const lesson = readLessonFile(join(ROOT, `assets/lessons/${id}.json`));
  const host = await finderHost(lesson, band);
  try {
    const result = await runFinder(host, { start: lesson.start, line: [], side: lesson.side });
    write(lessonReport(lesson, band, result, top), out);
  } finally {
    host.stop();
  }
}

async function reportFrom(moves: string, side: Color, { band, top, out }: Options) {
  const line = movesFrom(moves, Chess.default());
  const host = await positionHost(band);
  try {
    const from = { start: INITIAL_FEN, line, side };
    write(positionReport(from.line, from.side, band, await runFinder(host, from), top), out);
  } finally {
    host.stop();
  }
}

const write = (report: string, out: string | undefined) => {
  if (out) writeFileSync(out, report);
  else console.log(report);
};

/**
 * `text`'s moves as UCI, played from `start` (left as it was): SAN or UCI,
 * with or without move numbers. Throws at the first move that isn't legal.
 */
function movesFrom(text: string, start: Chess): Uci[] {
  const pos = start.clone();
  const tokens = text
    .replace(/\d+\.(\.\.)?/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return tokens.map((token) => {
    const uci = sanToUci(pos, token.replace(/[!?]+$/, '')) ?? recordedMove(pos, token);
    if (!uci) throw new Error(`Not a legal move here: ${token} (in "${text}")`);
    playMove(pos, uci);
    return uci;
  });
}

const points = (score: number) => Math.round(score * 100);

/** A report column: its name, and its cell for a find and its rank. */
type Column = [name: string, cell: (find: Find, rank: number) => string | number];

/** The columns every report has, for finds whose lines start at `start`. */
function findColumns(start: Chess): Column[] {
  const sans = (line: readonly Uci[]) => lineSans(line, start);
  const numbered = (from: readonly Uci[], moves: readonly Uci[]) =>
    numberedLine(sans([...from, ...moves]).slice(from.length), from.length + 1);
  const cue = (find: Find) => [...find.line, find.mistake];
  return [
    ['#', (_, rank) => rank + 1],
    ['After', (find) => numbered([], find.line) || '(start)'],
    ['Mistake', (find) => numbered(find.line, [find.mistake])],
    ['Share', (find) => percent(find.share)],
    ['Reach', (find) => percent(find.reach)],
    ['Cost', (find) => points(find.cost)],
    ['Found', (find) => (find.found === undefined ? '?' : percent(find.found))],
    ['Gain', (find) => `${find.estimate ? '~' : ''}${points(find.gain)}`],
    ['Score', (find) => (find.score * 1000).toFixed(2)],
    ['End', (find) => points(find.end)],
    ['Holds', (find) => (find.holds ? 'holds' : 'practical')],
    ['Punish with', (find) => find.replies.map((reply) => numbered(cue(find), [reply])).join(', ')],
    ['Then', (find) => numbered([...cue(find), find.replies[0]], find.payoff)],
  ];
}

/** `rows` as a Markdown table of `columns`, or "None.". */
function findTable(columns: readonly Column[], rows: readonly Find[]): string[] {
  const tableRow = (cells: readonly (string | number)[]) => `| ${cells.join(' | ')} |`;
  if (!rows.length) return ['None.'];
  return [
    tableRow(columns.map(([name]) => name)),
    tableRow(columns.map(() => '---')),
    ...rows.map((find, rank) => tableRow(columns.map(([, cell]) => cell(find, rank)))),
  ];
}

/** What the columns mean, and the limits the run used. */
const COLUMNS_AND_LIMITS = [
  `A mistake whose punishment nearly everyone finds (gain under ${points(LIMITS.minGain)}) is no find. Share: how often the opponent plays the mistake there. Reach: how often games get there, summed over the move orders that do (on the guide, only those the guide plays). Cost: points of expected score (of 100) the mistake gives away. Found: how often players at the cue find a punishing reply. Gain: points a player at the cue scores more by knowing the punishment than by playing as the band does (~: an estimate, the cue is thin or its measured replies cover under ${percent(LIMITS.estimateCoverage)} of its games). Score: the games that reach the cue by any move order (reach × share when one does) × gain, in thousandths, which ranks. End: the punishing side's expected score where Act III ends, following the band's likely replies; a lesson keeps only finds ending at ${points(LIMITS.keepScore)} or more. Holds: the best reply alone keeps the punishing side at least ${points(LIMITS.keepScore)} against best defence; practical: only the band's likely replies get there.`,
  '',
  `Limits: minGames ${MIN_GAMES}, ${Object.entries(LIMITS)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ')} (src/opportunity/limits.ts).`,
];

/**
 * A lesson's finds as a Markdown report: on the guide (the finds a lesson may
 * hold), the best `top` kept ones and every dropped one; then every find off
 * the guide, the evidence for a finder that opens anywhere.
 */
function lessonReport(
  lesson: Lesson,
  band: number,
  { finds, dropped, offGuide: off, thin }: FinderResult,
  top: number,
): string {
  const start = parsePosition(lesson.start)!;
  const inGuide = (find: Find) => {
    const key = [...playLine(find.line, start.clone())].at(-1)!.key;
    return lesson.positions[key]?.moves.some((move) => move.uci === find.mistake) ? 'yes' : 'no';
  };
  const columns: Column[] = [...findColumns(start), ['In guide', inGuide]];
  const guided = [...finds, ...dropped];
  return [
    `# Opportunities in ${lesson.title}, lichess ${band} band`,
    '',
    `On the guide (the punishing side plays only the lesson's moves to get there): ${finds.length} finds kept, the best ${Math.min(top, finds.length)} below, then the ${dropped.length} dropped. Off the guide: ${off.length} more, listed last. In guide: whether the lesson already lists the mistake.`,
    '',
    ...COLUMNS_AND_LIMITS,
    '',
    ...findTable(columns, finds.slice(0, top)),
    '',
    `## Dropped: Act III ends under ${points(LIMITS.keepScore)}`,
    '',
    ...findTable(columns, dropped),
    '',
    '## Off the guide',
    '',
    "Kept and dropped alike: each needs a punishing-side move the lesson doesn't teach.",
    '',
    ...findTable(columns, off),
    '',
    thinSummary(thin),
    '',
    guideSummary(lesson, guided),
    '',
    guideReplySummary(lesson, guided),
    '',
  ].join('\n');
}

/**
 * The finds from the position after `line` (from the standard start) for
 * `side`, with no lesson, as a Markdown report: the best `top`, whatever
 * Act III ends at, since no guide decides which a lesson would keep.
 */
function positionReport(
  line: readonly Uci[],
  side: Color,
  band: number,
  { offGuide: found, thin }: FinderResult,
  top: number,
): string {
  const start = Chess.default();
  const after = numberedLine(lineSans(line, start)) || 'the start';
  return [
    `# Opportunities for ${colorName(side)} after ${after}, lichess ${band} band`,
    '',
    `${found.length} finds, the best ${Math.min(top, found.length)} below. With no lesson, ${colorName(side)} plays Stockfish's best move wherever it moves.`,
    '',
    ...COLUMNS_AND_LIMITS,
    '',
    ...findTable(findColumns(start), found.slice(0, top)),
    '',
    thinSummary(thin),
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
 * in Act III, how often Act III kept the guide's, and each override: there
 * the guide's own move gives back a mistake's worth, so a person looks at it
 * before merge.
 */
function guideSummary(lesson: Lesson, finds: readonly Find[]): string {
  const start = parsePosition(lesson.start)!;
  const disagreements = finds.flatMap((find) =>
    find.disagreements.map((disagreement) => ({ find, ...disagreement })),
  );
  if (!disagreements.length)
    return "Act III: the guide never differs from Stockfish's best for the punishing side.";
  const overrides = disagreements
    .filter(({ find, ...disagreement }) => !keepsGuide(find.payoff, disagreement))
    .map(({ find, at, guide }) => {
      const line = [...find.line, find.mistake, find.replies[0], ...find.payoff.slice(0, at)];
      return guideRow(start, line, guide, `Act III plays ${uciSan(start, line, find.payoff[at])}`);
    });
  const summary = `Act III: the guide and Stockfish differ at ${disagreements.length} of the punishing side's moves in the finds' Act IIIs; Act III kept the guide's move at ${disagreements.length - overrides.length}.`;
  return [
    summary,
    ...(overrides.length
      ? [
          '',
          "Overrides (the guide's move gives back a mistake's worth; check before merge):",
          ...overrides,
        ]
      : []),
  ].join('\n');
}

/**
 * The cues where the guide's own move isn't one the cue accepts: there the
 * lesson teaches a reply that misses the punishment, so a person looks at it
 * before merge, like Act III's overrides.
 */
function guideReplySummary(lesson: Lesson, finds: readonly Find[]): string {
  const start = parsePosition(lesson.start)!;
  const rows = finds.flatMap(({ line, mistake, guideReply, replies }) => {
    if (!guideReply) return [];
    const cue = [...line, mistake];
    return [guideRow(start, cue, guideReply, `the cue's best ${uciSan(start, cue, replies[0])}`)];
  });
  return rows.length
    ? ["Cues where the guide's move misses the punishment (check before merge):", ...rows].join(
        '\n',
      )
    : "At every cue, the guide's move (where it has one) is a punishing reply.";
}

/** A row naming the guide's move after `line` beside what the finder plays there (`other`, already worded). */
function guideRow(start: Chess, line: readonly Uci[], guide: Uci, other: string): string {
  const sans = lineSans([...line, guide], start);
  return `- ${numberedLine(sans.slice(0, -1))}: the guide's ${sans.at(-1)}, ${other}`;
}

/** The SAN of `uci` played after `line`. */
const uciSan = (start: Chess, line: readonly Uci[], uci: Uci) =>
  lineSans([...line, uci], start).at(-1);

const USAGE = [
  'Usage: yarn opportunities <lesson> [--band 1400] [--top 20] [--out report.md]',
  '       yarn opportunities --from "<moves>" --side white|black [--band 1400] [--top 20] [--out report.md]',
].join('\n');

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : args[at + 1];
};
const fail = (message: string) => {
  console.error(message);
  process.exit(1);
};
const options: Options = {
  band: Number(flag('band') ?? FIND_BAND),
  top: Number(flag('top') ?? 20),
  out: flag('out'),
};
const [id] = args;
const moves = flag('from');
const side = flag('side');
const isColor = (name: string | undefined): name is Color => name === 'white' || name === 'black';
const report =
  moves !== undefined && isColor(side)
    ? reportFrom(moves, side, options)
    : moves === undefined && id && !id.startsWith('--')
      ? reportLesson(id, options)
      : fail(USAGE);
report?.catch((error: unknown) => fail(String(error instanceof Error ? error.stack : error)));
