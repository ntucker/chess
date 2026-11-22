/**
 * Stockfish as the app runs it (the same build), in Node, for the engine
 * check (./engineCheck), with a smaller search than the app's (`CHECK_SEARCH`),
 * and for the opponent check (./opponent), with the app's own.
 * Each position's analysis is kept in a committed answers file, so a rerun
 * searches only new positions and books the moves the last import did.
 */
import { type AnalysisLine, type Evaluation, settledAnalysis } from '@/evaluation/evaluation';
import { type Connection, liteStockfish, type SearchBudget } from '@/stockfish/engine';
import { type NodeEngine, sendTo, startNodeEngine } from '@/stockfish/node';

import type { Evaluate } from './engineCheck';
import { answersFile } from './jsonLines';

/**
 * The engine check's search: the best move, from 100,000 positions (about
 * depth 14 to 16). A lesson checks about 15,000 positions, which would take
 * about 14 hours at the app's search (`APP_SEARCH`); the check only needs to
 * tell a mistake from a sound move. Each cached row names the search that
 * filled it (`searchName`), and rows from another search are searched again.
 * (Rows from before rows named theirs also stopped at 1.5 s, which at about
 * 0.3 s a search hardly ever mattered; they carry this search's name.)
 */
const CHECK_SEARCH: SearchBudget = { ranks: 1, nodes: 100_000 };

/** How a cache row names the search that filled it, as `1x100000`. */
const searchName = ({ ranks, nodes }: SearchBudget) => `${ranks}x${nodes}`;

/** How many engines may stop (crash, or never answer) before the import gives up. */
const MAX_RESTARTS = 5;

/**
 * Starts the engine, searching with `search`. One that crashes or stops answering is replaced; a
 * position that stops `TRIES` engines (src/stockfish/engine.ts) rejects its search, and an engine that
 * can't be started, or stops more than `MAX_RESTARTS` times, ends the import.
 */
export async function nodeStockfish(
  cacheFile: string,
  search: SearchBudget = CHECK_SEARCH,
): Promise<{
  evaluate: Evaluate;
  /** Rewrites the answers file with only the positions this run evaluated. */
  saveUsed: () => void;
  stop: () => void;
}> {
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
      search,
    );
    const attached = connection;
    started.listener = (line) => attached.receive(line);
  };
  await connect();

  const checkSearch = searchName(search);
  // Rows from another search are searched again, and left out when the file is rewritten.
  const cache = answersFile<CacheRow>(
    cacheFile,
    (row) => row.key,
    (row) => row.search === checkSearch,
  );
  let searched = 0;
  const evaluate: Evaluate = async (line, key) => {
    const known = cache.get(key);
    if (known) {
      if (known.lines) return { lines: known.lines, depth: known.depth ?? 0, final: true };
      const { best, ...evaluation } = known.evaluation;
      return settledAnalysis(evaluation, best);
    }
    const analysis = await liteStockfish.analysis(line);
    const [{ uci, evaluation }] = analysis.lines;
    cache.add({
      key,
      search: checkSearch,
      evaluation: { ...evaluation, ...(uci && { best: uci }) },
      // A search ranking several moves keeps them all; the engine check's keeps only its best.
      ...(search.ranks > 1 && { lines: analysis.lines, depth: analysis.depth }),
    });
    if (++searched % 100 === 0) console.log(`engine check: ${searched} positions searched`);
    return analysis;
  };
  return {
    evaluate,
    saveUsed: cache.saveUsed,
    stop() {
      connection?.detach();
      engine?.terminate?.();
    },
  };
}

/** A cached analysis, as the cache file holds it: its first line. */
interface CacheRow {
  readonly key: string;
  /** The search that filled it (`searchName`). */
  readonly search: string;
  readonly evaluation: Evaluation & { readonly best?: string };
  /** Every move a search ranking several ranked, best first, and how deep it looked. */
  readonly lines?: readonly AnalysisLine[];
  readonly depth?: number;
}

function giveUp(error: unknown): never {
  console.error(error);
  process.exit(1);
}
