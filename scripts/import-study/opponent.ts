/**
 * The opponent check: does the learner's lesson answer every line a known
 * opponent plays? The opponent plays what their own lesson lists for them;
 * where it ends, every move club players commonly make (`SETTINGS`), and
 * Stockfish's move where too few of them reached the position. A gap is a
 * position on the learner's turn, before their `SETTINGS.moves + 1`th move,
 * where the learner's lesson has no book move.
 *
 *   yarn cover-opponent <source> --measure   counts the gaps
 *   yarn cover-opponent <source>             writes scripts/import-study/sources/<source>.pgn
 *
 * Writing fills each gap with a move, and plays on from it: Stockfish ranks
 * three moves (the app's search), and where more than one is within
 * `SETTINGS.nearPawns` of the best, Fable picks the one a club player should
 * learn. The PGN then goes last in the learner's recipe in studies.ts (with
 * `committedPgn`), where the importer books its moves and the explain step
 * writes their ideas. Engine, explorer and Fable answers are kept in
 * answers/opponent-<source>-*.jsonl, so a rerun asks only about new positions.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Chess } from 'chessops/chess';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';

import { positionKey, sanToUci } from '@/game/replay';
import { type Lesson, readLesson, type Uci } from '@/lesson/lesson';
import { APP_SEARCH } from '@/stockfish/engine';

import { chunks, claudeJson, MODELS, pool } from './convert/claude';
import { answersFile } from './jsonLines';
import { lichessExplorer } from './popularity';
import { nodeStockfish } from './stockfish';

/** How the opponent is modelled and how far the learner must be answered, for every source. */
export const SETTINGS = {
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
  /** The PGN's chapter title. */
  readonly title: string;
  /** What Fable is told about the opponent's style. */
  readonly style: string;
}

/**
 * Nathaniel's friend (project memory "friend-repertoire"): the Bowdler as
 * White (bc4-system), the London Mirror as Black (albin).
 */
export const OPPONENT_SOURCES: Readonly<Record<string, OpponentSource>> = {
  // london-mirror.pgn came from this tool's first, uncommitted version (full Stockfish at depth
  // 18), so regenerating it picks some White moves again.
  'london-mirror': {
    mine: 'london',
    theirs: 'albin',
    start: ['d4'],
    title: 'Against the London mirror',
    style:
      "The opponent copies White's London setup as Black where he can (...d5, ...Bf5, ...e6, ...c6).",
  },
  'caro-kann-hillbilly': {
    mine: 'caro-kann',
    theirs: 'bc4-system',
    start: ['e4', 'c6'],
    title: 'Against the Hillbilly Attack',
    style:
      'The opponent plays an early Bc4 against everything (2.Bc4 here, often Bb3 and an early Qh5).',
  },
};

const ROOT = join(__dirname, '../..');
const lessonAt = (id: string) =>
  readLesson(JSON.parse(readFileSync(join(ROOT, `assets/lessons/${id}.json`), 'utf8')));
const answers = (source: string, kind: string) =>
  join(ROOT, `scripts/import-study/answers/opponent-${source}-${kind}.jsonl`);

/** A move of the generated tree, in SAN; `fresh` where it fills a gap. */
interface TreeMove {
  readonly san: string;
  readonly fresh: boolean;
  children: TreeMove[];
}

/** A position waiting to be walked, and where its moves go in the tree. */
interface Step {
  readonly pos: Chess;
  readonly line: readonly string[];
  readonly ucis: readonly Uci[];
  readonly node: TreeMove;
}

/** A learner position with no book move, and the engine's near-best moves there. */
interface Gap {
  readonly step: Step;
  readonly candidates: readonly { readonly san: string; readonly pawns: number }[];
}

const learnerMoveNumber = (side: Lesson['side'], ply: number) =>
  side === 'white' ? ply / 2 + 1 : (ply + 1) / 2;

const bookMoves = (lesson: Lesson, key: string) =>
  lesson.positions[key]?.moves.filter((move) => move.book).map((move) => move.uci) ?? [];

async function run(name: string, measure: boolean) {
  const source = OPPONENT_SOURCES[name];
  if (!source) throw new Error(`No source ${name}: ${Object.keys(OPPONENT_SOURCES).join(', ')}`);
  const mine = lessonAt(source.mine);
  const theirs = lessonAt(source.theirs);
  const engine = await nodeStockfish(answers(name, 'stockfish'), APP_SEARCH);
  const explorer = lichessExplorer({ cacheFile: answers(name, 'explorer') });
  const picks = answersFile<{ key: string; move: string }>(
    answers(name, 'picks'),
    (row) => row.key,
    () => true,
  );

  /** The opponent's moves here: their lesson's, else club players' common ones, else Stockfish's. */
  const opponentMoves = async ({ pos, ucis }: Step): Promise<readonly Uci[]> => {
    const key = positionKey(pos);
    const listed = theirs.positions[key]?.moves.map((move) => move.uci) ?? [];
    if (listed.length) return listed;
    const counts = await explorer.ask(key, SETTINGS.band);
    const games = Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (games >= SETTINGS.minGames)
      return Object.entries(counts)
        .filter(([, n]) => n / games >= SETTINGS.share)
        .map(([uci]) => uci);
    const best = (await engine.evaluate(ucis, key)).lines[0]?.uci;
    return best ? [best] : [];
  };

  /** The engine's moves within `nearPawns` of its best, from the side to move's view. */
  const nearBest = async ({ pos, ucis }: Step) => {
    const { lines } = await engine.evaluate(ucis, positionKey(pos));
    const sign = pos.turn === 'white' ? 1 : -1;
    const ranked = lines.flatMap(({ uci, evaluation }) =>
      uci ? [{ san: makeSan(pos, parseUci(uci)!), pawns: sign * evaluation.pawns }] : [],
    );
    return ranked.filter(({ pawns }) => pawns >= ranked[0].pawns - SETTINGS.nearPawns);
  };

  const pickKey = ({ step, candidates }: Gap) =>
    `${positionKey(step.pos)} ${candidates.map(({ san }) => san).join(',')}`;

  /** Fable's pick at each gap with a choice, from the answers file first. */
  const pickAll = async (gaps: readonly Gap[]) => {
    const asking = gaps.filter((gap) => !picks.get(pickKey(gap)));
    await pool(chunks(asking, SETTINGS.batch), 4, async (group) => {
      const { output } = await claudeJson(
        MODELS.explain,
        pickPrompt(mine, source.style),
        JSON.stringify(
          group.map(({ step, candidates }, id) => ({
            id: String(id),
            moves: step.line.join(' '),
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
        if (gap?.candidates.some(({ san }) => san === move)) picks.add({ key: pickKey(gap), move });
      }
    });
  };

  const root: TreeMove = { san: '', fresh: false, children: [] };
  let frontier: Step[] = [{ pos: Chess.default(), line: [], ucis: [], node: root }];
  for (const san of source.start) {
    const [step] = frontier;
    const next = playMove(step, sanToUci(step.pos, san)!, false);
    frontier = [next];
  }
  const seen = new Set<string>();
  const missing: Step[] = [];
  let learnerTurns = 0;
  let filled = 0;
  let picked = 0;
  while (frontier.length) {
    const gaps: Gap[] = [];
    const next: Step[] = [];
    for (const step of frontier) {
      const key = positionKey(step.pos);
      const learnerTurn = step.pos.turn === mine.side;
      if (learnerTurn && learnerMoveNumber(mine.side, step.line.length) > SETTINGS.moves) continue;
      if (seen.has(key) || step.pos.isEnd()) continue;
      seen.add(key);
      if (!learnerTurn) {
        for (const uci of await opponentMoves(step)) next.push(playMove(step, uci, false));
        continue;
      }
      learnerTurns++;
      const book = bookMoves(mine, key);
      if (book.length) for (const uci of book) next.push(playMove(step, uci, false));
      else if (measure) missing.push(step);
      else gaps.push({ step, candidates: await nearBest(step) });
    }
    await pickAll(gaps.filter(({ candidates }) => candidates.length > 1));
    for (const gap of gaps) {
      const san = picks.get(pickKey(gap))?.move ?? gap.candidates[0].san;
      if (gap.candidates.length > 1) picked++;
      filled++;
      next.push(playMove(gap.step, sanToUci(gap.step.pos, san)!, true));
    }
    frontier = next;
  }
  engine.stop();
  // Measuring stops at the gaps, so it would drop what writing needs past them.
  if (!measure) for (const file of [engine, explorer, picks]) file.saveUsed();

  console.log(
    `${mine.id} against ${theirs.id}, through ${mine.side}'s move ${SETTINGS.moves}: ${learnerTurns} positions on ${mine.side}'s turn, ${missing.length} with no book move`,
  );
  if (measure) {
    for (const { line } of missing) console.log(`  ${line.join(' ')}`);
    return;
  }
  keepFresh(root);
  const file = join(ROOT, `scripts/import-study/sources/${name}.pgn`);
  writeFileSync(file, pgn(source.title, root));
  console.log(`${file}: ${filled} moves filled, ${picked} of them picked by Fable`);
}

/** `step` after `uci`, with the move added to the tree. */
function playMove(step: Step, uci: Uci, fresh: boolean): Step {
  const move = parseUci(uci)!;
  const node: TreeMove = { san: makeSan(step.pos, move), fresh, children: [] };
  step.node.children.push(node);
  const pos = step.pos.clone();
  pos.play(move);
  return { pos, line: [...step.line, node.san], ucis: [...step.ucis, uci], node };
}

/** Drops the branches that fill no gap; true when `move` or a move after it does. */
function keepFresh(move: TreeMove): boolean {
  move.children = move.children.filter(keepFresh);
  return move.fresh || move.children.length > 0;
}

/** The tree as one PGN chapter, its first move at each position the main line. */
function pgn(title: string, root: TreeMove): string {
  const number = (ply: number, always: boolean) =>
    ply % 2 === 0 ? `${ply / 2 + 1}. ` : always ? `${(ply + 1) / 2}... ` : '';
  const movetext = (from: TreeMove, ply: number, always: boolean): string[] => {
    const out: string[] = [];
    for (let at = from, p = ply, numbered = always; at.children.length; p++) {
      const [main, ...others] = at.children;
      out.push(number(p, numbered) + main.san);
      for (const other of others)
        out.push(
          `( ${[number(p, true) + other.san, ...movetext(other, p + 1, false)].join(' ')} )`,
        );
      numbered = others.length > 0;
      at = main;
    }
    return out;
  };
  return [
    `[Event "${title}"]`,
    `[ChapterName "${title}"]`,
    `[Annotator "Moves: Opening Night, from Stockfish 19 and lichess games rated ${SETTINGS.band}"]`,
    '[Result "*"]',
    '',
    `${movetext(root, 0, false).join(' ')} *`,
    '',
  ].join('\n');
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
