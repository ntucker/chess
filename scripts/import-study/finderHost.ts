/**
 * The opportunity finder's host in Node (src/opportunity): it answers the
 * finder's requests from a lesson's own answers files and asks lichess and
 * Stockfish for the missing ones. The opportunities report (./opportunities.ts)
 * and the importer's opportunities step (./finds.ts) both run the finder on it.
 *
 * The opponent's replies come from the lichess explorer alone (which needs a
 * token, as ./index.ts says), so a thin position ends the search for
 * mistakes. Stockfish's searches come from the app's engine in Node: sketches
 * stop at the first whole depth of `SKETCH_DEPTH`, full searches are the
 * app's (`APP_SEARCH`). Every answer is appended to the lesson's own files,
 * answers/<lesson>-opportunities-{explorer,sketch,full}.jsonl, which no other
 * step reads or prunes, so a rerun asks only about positions none has seen
 * and a stopped run resumes. Commit them.
 */
import { join } from 'node:path';

import { type Analysis, sketched } from '@/evaluation/evaluation';
import type { Lesson, PositionKey, Uci } from '@/lesson/lesson';
import { guideOrder } from '@/lesson/mistakes';
import { findOpportunities, type FinderResult } from '@/opportunity/finder';
import { MIN_GAMES } from '@/opportunity/limits';
import { type Answers, type Replies, repliesFrom, type Request } from '@/opportunity/walk';
import { APP_SEARCH, type Stockfish } from '@/stockfish/engine';

import { answersFile } from './jsonLines';
import { type ExplorerAnswer, lichessExplorer } from './popularity';
import { nodeStockfish } from './stockfish';

/** The rating band the finder's limits (`LIMITS`) were tuned at: the report's default, and the band the importer's finds come from. */
export const FIND_BAND = 1400;

const ROOT = join(__dirname, '../..');
const answersPath = (id: string, kind: string) =>
  join(ROOT, `scripts/import-study/answers/${id}-opportunities-${kind}.jsonl`);

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
export async function finderHost(lesson: Lesson, band: number): Promise<FinderHost> {
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
      const row = sketches.get(key);
      return fulls.get(key) ?? (row && { lines: row.lines, depth: row.depth, final: false });
    },
    // The run is for `lesson.side`: its book moves (off the book, its unmarked moves), and every move of the erring side.
    guideMoves: ({ key }) => {
      const played = guideOrder(lesson, key, lesson.side);
      return played.length ? played.map((move) => move.uci) : undefined;
    },
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
    replies.set(spot.key, explorerReplies(spot.key, await explorer.ask(spot.key, band)));
  };

  /**
   * Gets every missing answer: the explorer's one at a time (it is paced),
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

/** The finder's run over `lesson` for its side, from where it starts, once every answer is in. */
export const runFinder = (host: FinderHost, lesson: Lesson): Promise<FinderResult> => {
  const input = { start: lesson.start, line: [], side: lesson.side, answers: host.answers };
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
