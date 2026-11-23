/**
 * The opponent check: does the learner's lesson answer every line a known
 * opponent plays? The opponent plays what their own lesson lists for them;
 * where it ends, every move club players commonly make (`SETTINGS`), and
 * Stockfish's move where too few of them reached the position or none of their
 * moves is common. A gap is a position on the learner's turn, before their
 * `SETTINGS.moves + 1`th move, where the learner's lesson has no book move.
 *
 *   yarn cover-opponent <source> --measure   counts the gaps
 *   yarn cover-opponent <source>             writes scripts/import-study/sources/<source>.pgn
 *
 * Writing fills each gap with a move, and plays on from it: Stockfish ranks
 * three moves (the app's search), and where more than one is within
 * `SETTINGS.nearPawns` of the best, Fable picks the one a club player should
 * learn. The PGN holds the whole walk (./opponent.ts), the lesson's own book
 * moves too, so rerunning it on a lesson already built from it writes the same
 * file. A rerun keeps every line the file already had too, even one the
 * opponent no longer reaches (their lesson or the explorer changed), since
 * the lesson may teach it. It goes last in the learner's recipe in studies.ts (with
 * `committedPgn`), where the importer books its moves and the explain step
 * writes their ideas. Engine, explorer and Fable answers are appended to
 * answers/opponent-<source>-*.jsonl and never pruned, so a rerun asks only
 * about positions none has seen.
 */
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import type { Chess } from 'chessops/chess';
import { parsePgn } from 'chessops/pgn';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { positionKey, sanToUci } from '@/game/replay';
import { type Evaluation, forSide } from '@/evaluation/evaluation';
import type { Lesson, Uci } from '@/lesson/lesson';
import { APP_SEARCH } from '@/stockfish/engine';

import { chunks, claudeJson, MODELS, PARALLEL, pool } from './convert/claude';
import { answersFile } from './jsonLines';
import { mergeTrees, pgnOf, type Step, walk } from './opponent';
import { lichessExplorer } from './popularity';
import { readLessonFile } from './register';
import { nodeStockfish } from './stockfish';

/** How the opponent is modelled and how far the learner must be answered, for every source. */
const SETTINGS = {
  /** The explorer's rating band for club players' moves. */
  band: 1600,
  /** A move counts as common at this share of the band's games... */
  share: 0.1,
  /** ...when at least this many games reached the position; else Stockfish's move stands in. */
  minGames: 30,
  /** The learner is answered through this move of theirs. */
  moves: 10,
  /** Engine moves this close to the best (in pawns) are left to Fable to pick from. */
  nearPawns: 0.3,
  /** Gaps sent to Fable per request. */
  batch: 10,
} as const;

/** One generated source: the learner's lesson against the opponent's, from a start. */
interface OpponentSource {
  readonly mine: string;
  readonly theirs: string;
  /** Moves both play first (SAN), up to where the opponent's choices begin. */
  readonly start: readonly string[];
  /** What Fable is told about the opponent's style. */
  readonly style: string;
}

/**
 * The opponents checked so far: one player who plays the Bowdler as White
 * (bc4-system) and the London Mirror as Black (albin). Each source's title and
 * credit live on its `committedPgn` entry in studies.ts.
 */
const OPPONENT_SOURCES: Readonly<Record<string, OpponentSource>> = {
  // Most of london-mirror.pgn's White moves came from a deeper search (full Stockfish, depth 18);
  // a rerun keeps them, since the lesson books them.
  'london-mirror': {
    mine: 'london',
    theirs: 'albin',
    start: ['d4'],
    style:
      "The opponent copies White's London setup as Black where he can (...d5, ...Bf5, ...e6, ...c6).",
  },
  'caro-kann-hillbilly': {
    mine: 'caro-kann',
    theirs: 'bc4-system',
    start: ['e4', 'c6'],
    style:
      'The opponent plays an early Bc4 against everything (2.Bc4 here, often Bb3 and an early Qh5).',
  },
};

const ROOT = join(__dirname, '../..');
const lessonAt = (id: string) => readLessonFile(join(ROOT, `assets/lessons/${id}.json`));
const answers = (source: string, kind: string) =>
  join(ROOT, `scripts/import-study/answers/opponent-${source}-${kind}.jsonl`);

type Engine = Awaited<ReturnType<typeof nodeStockfish>>;

/** The opponent's moves: their lesson's, else club players' common ones, else Stockfish's. */
function opponentModel(theirs: Lesson, engine: Engine, source: string) {
  const explorer = lichessExplorer({ cacheFile: answers(source, 'explorer') });
  return async ({ pos, ucis }: Step): Promise<readonly Uci[]> => {
    const key = positionKey(pos);
    const listed = theirs.positions[key]?.moves.map((move) => move.uci) ?? [];
    if (listed.length) return listed;
    const counts = Object.entries(await explorer.ask(key, SETTINGS.band));
    const games = counts.reduce((sum, [, n]) => sum + n, 0);
    const common = counts.filter(([, n]) => n / games >= SETTINGS.share).map(([uci]) => uci);
    if (games >= SETTINGS.minGames && common.length) return common;
    const best = (await engine.evaluate(ucis, key)).lines[0]?.uci;
    return best ? [best] : [];
  };
}

/** A move near Stockfish's best at a gap. */
interface Candidate {
  readonly san: string;
  /** How many pawns the learner is ahead after it. */
  readonly pawns: number;
}

const toCandidate = ({ san, evaluation }: { san: string; evaluation: Evaluation }, pos: Chess) => ({
  san,
  pawns: forSide(evaluation.pawns, pos.turn),
});

/** Fills gaps with Stockfish's moves, Fable picking among near-best ones; counts what it did. */
function gapFiller(source: string, mine: Lesson, style: string, engine: Engine) {
  const picks = answersFile<{ key: string; move: string }>(
    answers(source, 'picks'),
    (row) => row.key,
    () => true,
  );
  const counts = { filled: 0, picked: 0 };

  /** The engine's moves within `nearPawns` of its best; a mate it finds is the only move. */
  const nearBest = async ({ pos, ucis }: Step): Promise<readonly Candidate[]> => {
    const { lines } = await engine.evaluate(ucis, positionKey(pos));
    const ranked = lines.flatMap(({ uci, evaluation }) =>
      uci ? [{ san: makeSan(pos, parseUci(uci)!), evaluation }] : [],
    );
    // A mate's pawns are 0, so mates are judged apart: the best line mates, or the
    // engine would rank it lower, and a line that gets mated is never near the best.
    if (ranked[0]?.evaluation.mate !== undefined) return [toCandidate(ranked[0], pos)];
    const candidates = ranked
      .filter(({ evaluation }) => evaluation.mate === undefined)
      .map((line) => toCandidate(line, pos));
    return candidates.filter(({ pawns }) => pawns >= candidates[0].pawns - SETTINGS.nearPawns);
  };
  const pickKey = (step: Step, candidates: readonly Candidate[]) =>
    `${positionKey(step.pos)} ${candidates.map(({ san }) => san).join(',')}`;

  /** Asks Fable at each gap with a choice that the answers file has no pick for. */
  const askFable = async (gaps: readonly { step: Step; candidates: readonly Candidate[] }[]) => {
    const asking = gaps.filter(
      ({ step, candidates }) => candidates.length > 1 && !picks.get(pickKey(step, candidates)),
    );
    await pool(chunks(asking, SETTINGS.batch), PARALLEL, async (group) => {
      const { output } = await claudeJson(
        MODELS.explain,
        pickPrompt(mine, style),
        JSON.stringify(
          group.map(({ step, candidates }, id) => ({
            id: String(id),
            moves: step.line.join(' '),
            // A full FEN, whose move counters the prompt doesn't use.
            fen: `${positionKey(step.pos)} 0 1`,
            candidates,
          })),
        ),
        PICK_SCHEMA,
        'medium',
      );
      for (const { id, move } of (output as { picks?: { id: string; move: string }[] })?.picks ??
        []) {
        const gap = group[Number(id)];
        if (gap?.candidates.some(({ san }) => san === move))
          picks.add({ key: pickKey(gap.step, gap.candidates), move });
      }
    });
  };

  const fill = async (steps: readonly Step[]): Promise<readonly (Uci | undefined)[]> => {
    // One search at a time: the engine stops a search when another starts.
    const gaps = [];
    for (const step of steps) gaps.push({ step, candidates: await nearBest(step) });
    await askFable(gaps);
    return gaps.map(({ step, candidates }) => {
      // An engine that names no move leaves the gap open.
      if (!candidates.length) return undefined;
      const pick = candidates.length > 1 ? picks.get(pickKey(step, candidates))?.move : undefined;
      counts.filled++;
      if (pick) counts.picked++;
      return sanToUci(step.pos, pick ?? candidates[0].san);
    });
  };
  return { fill, counts };
}

async function run(name: string, measure: boolean) {
  const source = OPPONENT_SOURCES[name];
  if (!source) throw new Error(`No source ${name}: ${Object.keys(OPPONENT_SOURCES).join(', ')}`);
  const mine = lessonAt(source.mine);
  const theirs = lessonAt(source.theirs);
  const engine = await nodeStockfish(answers(name, 'stockfish'), APP_SEARCH);
  const filler = measure ? undefined : gapFiller(name, mine, source.style, engine);
  const { tree, learnerTurns, open } = await walk(source.start, {
    learner: mine,
    moves: SETTINGS.moves,
    opponent: opponentModel(theirs, engine, name),
    answer: filler?.fill ?? (async (steps) => steps.map(() => undefined)),
  });
  engine.stop();

  console.log(
    `${mine.id} against ${theirs.id}, through ${mine.side}'s move ${SETTINGS.moves}: ${learnerTurns} positions on ${mine.side}'s turn, ${open.length} with no book move`,
  );
  for (const { line } of open) console.log(`  ${line.join(' ')}`);
  if (!filler) return;
  const file = join(ROOT, `scripts/import-study/sources/${name}.pgn`);
  if (existsSync(file)) mergeTrees(tree, parsePgn(readFileSync(file, 'utf8'))[0].moves);
  writeFileSync(
    file,
    pgnOf(tree, {
      Event: name,
      Annotator: `Moves: Opening Night, from Stockfish 19 and lichess games rated ${SETTINGS.band}`,
    }),
  );
  const { filled, picked } = filler.counts;
  console.log(`${file}: ${filled} moves filled, ${picked} of them picked by Fable`);
}

const pickPrompt = (lesson: Lesson, style: string) =>
  `You prepare an opening repertoire for a club player (about 1500 on lichess) who plays ${lesson.side} in "${lesson.title}". ${style}
Each item is a position (the moves from the start, and its FEN) with Stockfish's moves there that are within ${SETTINGS.nearPawns} pawns of each other, with how many pawns ${lesson.side} is ahead after each.
For each item, pick the one move the player should learn: the one that fits the opening's usual plans and is easiest to play well, unless another is clearly stronger in practice. Answer with the move's SAN exactly as listed.`;

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, move: { type: 'string' } },
        required: ['id', 'move'],
      },
    },
  },
  required: ['picks'],
};

const [name, flag] = process.argv.slice(2);
run(name, flag === '--measure').catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
