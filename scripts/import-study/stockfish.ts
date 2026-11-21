/**
 * Stockfish as the app runs it (the same build), in Node, for the engine
 * check (./engineCheck), with a smaller search than the app's (`CHECK_SEARCH`).
 * Each position's analysis is cached, so a rerun searches only new positions.
 */
import { type Evaluation, type FinalAnalysis, settledAnalysis } from '@/evaluation/evaluation';
import { type Connection, liteStockfish, type SearchBudget } from '@/stockfish/engine';
import { type NodeEngine, sendTo, startNodeEngine } from '@/stockfish/node';

import type { Evaluate } from './engineCheck';
import { appendJsonLine, readJsonLines } from './jsonLines';

/**
 * The engine check's search: the best move, from 100,000 positions (about
 * depth 14 to 16). A lesson checks about 15,000 positions, which would take
 * about 14 hours at the app's search (`APP_SEARCH`); the check only needs to
 * tell a mistake from a sound move. Each cached row names the search that
 * filled it (`searchName`), and rows from another search are searched again.
 */
const CHECK_SEARCH: SearchBudget = { ranks: 1, nodes: 100_000 };

/** How a cache row names the search that filled it, as `1x100000`. */
const searchName = ({ ranks, nodes }: SearchBudget) => `${ranks}x${nodes}`;

/**
 * The search every row cached before rows named theirs came from (it also
 * stopped at 1.5 s, which at about 0.3 s a search hardly ever mattered).
 */
const UNNAMED_SEARCH = searchName({ ranks: 1, nodes: 100_000 });

/** A cache file's rows as analyses by position, keeping only those `search` (`searchName`) filled. */
export function cachedAnalyses(
  rows: readonly CacheRow[],
  search: string,
): Map<string, FinalAnalysis> {
  return new Map(
    rows
      .filter((row) => (row.search ?? UNNAMED_SEARCH) === search)
      .map(({ key, evaluation: { best, ...evaluation } }) => [
        key,
        settledAnalysis(evaluation, best),
      ]),
  );
}

/** How many engines may stop (crash, or never answer) before the import gives up. */
const MAX_RESTARTS = 5;

/**
 * Starts the engine. One that crashes or stops answering is replaced; a
 * position that stops `TRIES` engines (src/stockfish/engine.ts) rejects its search, and an engine that
 * can't be started, or stops more than `MAX_RESTARTS` times, ends the import.
 */
export async function nodeStockfish(
  cacheFile: string,
): Promise<{ evaluate: Evaluate; stop: () => void }> {
  let engine: NodeEngine | undefined;
  let connection: Connection | undefined;
  let restarts = 0;
  // Searches wait for the next engine, so a restart that can't happen would hang the import.
  const restart = () => {
    if (++restarts > MAX_RESTARTS) giveUp(`Stockfish stopped ${restarts} times`);
    else connect().catch(giveUp);
  };
  const connect = async () => {
    engine?.terminate?.();
    const started = await startNodeEngine();
    engine = started;
    connection = liteStockfish.attach(
      sendTo(started),
      {
        ready() {},
        failed: restart,
      },
      CHECK_SEARCH,
    );
    const attached = connection;
    started.listener = (line) => attached.receive(line);
  };
  await connect();

  const checkSearch = searchName(CHECK_SEARCH);
  const cached = cachedAnalyses(readJsonLines(cacheFile) as CacheRow[], checkSearch);
  let searched = 0;
  const evaluate: Evaluate = async (line, key) => {
    const known = cached.get(key);
    if (known) return known;
    const analysis = await liteStockfish.analysis(line);
    cached.set(key, analysis);
    const [{ uci, evaluation }] = analysis.lines;
    const row: CacheRow = {
      key,
      search: checkSearch,
      evaluation: { ...evaluation, ...(uci && { best: uci }) },
    };
    appendJsonLine(cacheFile, row);
    if (++searched % 100 === 0) console.log(`engine check: ${searched} positions searched`);
    return analysis;
  };
  return {
    evaluate,
    stop() {
      connection?.detach();
      engine?.terminate?.();
    },
  };
}

/** A cached analysis, as the cache file holds it: its first line. */
export interface CacheRow {
  readonly key: string;
  /** The search that filled it (`searchName`). */
  readonly search?: string;
  readonly evaluation: Evaluation & { readonly best?: string };
}

function giveUp(error: unknown): never {
  console.error(error);
  process.exit(1);
}
