/**
 * The opportunity finder's host in Node (src/opportunity): it answers the
 * finder's requests from a lesson's own answers files and asks lichess and
 * Stockfish for the missing ones. The opportunities report (./opportunities.ts)
 * and the importer's opportunities step (./finds.ts) both run the finder on it.
 *
 * The opponent's replies come from one source for a whole run (`ReplySource`):
 * the lichess explorer (which needs a token, as ./index.ts says), where a thin
 * position ends the search for mistakes, or, for a run from a position, Maia
 * at a rating (./maia.ts), whose shares are estimates and never thin, worked
 * out again on each run and kept only in memory.
 * Stockfish's searches come from the app's engine in Node: sketches stop at the
 * first whole depth of `SKETCH_DEPTH`, full searches are the app's
 * (`APP_SEARCH`). Every lichess and Stockfish answer is appended to the run's
 * own files, so a rerun asks only about positions none has seen and a stopped
 * run resumes: a lesson's are
 * answers/<lesson>-opportunities-{explorer,sketch,full}.jsonl, which no other
 * step reads or prunes (commit them); a run from a position with no lesson
 * (`positionHost`) shares .cache/opportunities/, which git ignores, since no
 * lesson is rebuilt from it.
 */
import { join } from 'node:path';

import { type Analysis, sketched } from '@/evaluation/evaluation';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';
import { guideOrder } from '@/lesson/mistakes';
import type { MaiaRating } from '@/maia/ratings';
import { findOpportunities, type FinderInput, type FinderResult } from '@/opportunity/finder';
import { MIN_GAMES } from '@/opportunity/limits';
import {
  type Answers,
  maiaReplies,
  type Replies,
  repliesFrom,
  type Request,
  type Spot,
} from '@/opportunity/walk';
import { APP_SEARCH, type Stockfish } from '@/stockfish/engine';

import { answersFile } from './jsonLines';
import { nodeMaiaShares } from './maia';
import { type ExplorerAnswer, lichessExplorer } from './popularity';
import { nodeStockfish } from './stockfish';

/** The rating band the finder's limits (`LIMITS`) were tuned at: the report's default, and the band the importer's finds come from. */
export const FIND_BAND = 1400;

const ROOT = join(__dirname, '../..');

/** A sketch as its answers file keeps it. */
interface SketchRow extends Pick<Analysis, 'lines' | 'depth'> {
  readonly key: string;
}

/** The first whole depth of at least `SKETCH_DEPTH` on `watch`'s engine, or the final analysis if the search ends sooner. */
const sketch = (watch: Stockfish['watch'], line: readonly Uci[]) =>
  new Promise<Analysis>((resolve, reject) => {
    let stop: (() => void) | undefined;
    let done = false;
    stop = watch(line, {
      update(analysis) {
        if (done || !sketched(analysis)) return;
        done = true;
        resolve(analysis);
        // The watch may answer before it returns its stop.
        queueMicrotask(() => stop?.());
      },
      fail: reject,
    });
  });

export interface FinderHost {
  /** What the host knows so far, for the finder (`FinderInput.answers`). */
  readonly answers: Answers;
  /** Gets every answer `requests` asks for. */
  readonly answer: (requests: readonly Request[]) => Promise<void>;
  /** Stops the engine. */
  readonly stop: () => void;
}

/**
 * The host for a run over `lesson` in the explorer's `band`: the replies and
 * searches from the lesson's answers files, and its guide moves by
 * `guideOrder` for `lesson.side` (so `lesson` must hold the counts the order
 * reads).
 */
export const finderHost = (lesson: Lesson, band: number): Promise<FinderHost> =>
  host(
    { from: 'lichess', band },
    join(ROOT, `scripts/import-study/answers/${lesson.id}-opportunities-`),
    // The run is for `lesson.side`: its book moves (off the book, its unmarked moves), and every move of the erring side.
    ({ key }) => {
      const played = guideOrder(lesson, key, lesson.side);
      return played.length ? played.map((move) => move.uci) : undefined;
    },
  );

/**
 * Where a run's replies come from, for the whole run (a score never mixes
 * sources): lichess's games in a rating band, or Maia's estimate at a rating.
 */
export type ReplySource =
  | { readonly from: 'lichess'; readonly band: number }
  | { readonly from: 'maia'; readonly rating: MaiaRating };

/**
 * The host for a run from any position with replies from `source`, with no
 * lesson: no guide moves, so its punishing side plays Stockfish's best. Its
 * answers are shared by every such run, since each is keyed by its position.
 */
export const positionHost = (source: ReplySource): Promise<FinderHost> =>
  host(source, join(ROOT, '.cache/opportunities/'));

/** A host keeping its answers in `<prefix>{explorer,sketch,full}.jsonl`, with a lesson's `guideMoves` where it has one. */
async function host(
  source: ReplySource,
  prefix: string,
  guideMoves?: Answers['guideMoves'],
): Promise<FinderHost> {
  const path = (kind: 'explorer' | 'sketch' | 'full') => `${prefix}${kind}.jsonl`;
  const repliesAt = replySource(source, path('explorer'));
  const sketches = answersFile<SketchRow>(
    path('sketch'),
    (row) => row.key,
    () => true,
  );
  const engine = await nodeStockfish(path('full'), APP_SEARCH);
  // By position. Maia reads the moves before a position too, so a Maia run keeps
  // the answer from the first move order that reaches it.
  const replies = new Map<string, Replies>();
  const fulls = new Map<string, Analysis>();

  const answers: Answers = {
    replies: ({ key }) => replies.get(key),
    analysis: ({ key }) => {
      const row = sketches.get(key);
      return fulls.get(key) ?? (row && { lines: row.lines, depth: row.depth, final: false });
    },
    guideMoves,
  };

  let searched = 0;
  const search = async ({ kind, spot }: Request) => {
    if (kind === 'full') fulls.set(spot.key, await engine.evaluate(spot.line, spot.key));
    else if (!sketches.get(spot.key)) {
      const { lines, depth } = await sketch(engine.watch, spot.line);
      sketches.add({ key: spot.key, lines, depth });
    }
    if (++searched % 50 === 0) console.log(`${searched} searches`);
  };
  const ask = async ({ spot }: Request) => {
    replies.set(spot.key, await repliesAt(spot));
  };

  /**
   * Gets every missing answer: the replies one at a time (the explorer is paced),
   * Stockfish's one at a time beside them (it searches one position at a time).
   */
  const answer = async (requests: readonly Request[]) => {
    const oneAtATime = async (
      wanted: readonly Request[],
      get: (request: Request) => Promise<void>,
    ) => {
      for (const request of wanted) await get(request);
    };
    const isReplies = ({ kind }: Request) => kind === 'replies';
    await Promise.all([
      oneAtATime(requests.filter(isReplies), ask),
      oneAtATime(
        requests.filter((request) => !isReplies(request)),
        search,
      ),
    ]);
  };

  return { answers, answer, stop: engine.stop };
}

/** The replies at a position from `source`; lichess's answers are kept in `explorerFile`. */
function replySource(source: ReplySource, explorerFile: string): (spot: Spot) => Promise<Replies> {
  if (source.from === 'maia') {
    const shares = nodeMaiaShares(source.rating);
    return async ({ line }) => maiaReplies(shares(line));
  }
  const explorer = lichessExplorer({ token: process.env.LICHESS_TOKEN, cacheFile: explorerFile });
  return async ({ key }) => explorerReplies(key, await explorer.ask(key, source.band));
}

/** The explorer's answer at `key` as the finder's replies (`repliesFrom`, thin under `MIN_GAMES`). */
export const explorerReplies = (key: PositionKey, { counts, total }: ExplorerAnswer) =>
  repliesFrom(key, counts, MIN_GAMES, total);

/**
 * The value `compute` gives once the host has every answer it asks for:
 * `compute` asks for the missing ones through `ask` and returns undefined
 * until then. Example: the finder's whole run, or a cue's gain in another band.
 */
export async function settle<T>(
  host: FinderHost,
  compute: (ask: (request: Request) => void) => T | undefined,
  log?: (round: number, missing: number) => void,
): Promise<T> {
  for (let round = 1; ; round++) {
    const requests: Request[] = [];
    const value = compute((request) => requests.push(request));
    if (!requests.length && value !== undefined) return value;
    if (!requests.length) throw new Error('The finder is waiting on an answer it never asked for');
    log?.(round, requests.length);
    await host.answer(requests);
  }
}

/** Where a run over `lesson` opens: its start, for its side. */
export const lessonStart = ({ start, side }: Lesson) => ({ start, line: [], side });

/** The finder's run from `from` (`lessonStart`, or any position), once every answer is in. */
export const runFinder = (
  host: FinderHost,
  from: Pick<FinderInput, 'start' | 'line' | 'side'>,
): Promise<FinderResult> => {
  const input = { ...from, answers: host.answers };
  return settle(
    host,
    (ask) => {
      const result = findOpportunities(input);
      result.requests.forEach(ask);
      return result;
    },
    (round, missing) => console.log(`round ${round}: ${missing} answers to get`),
  );
};
