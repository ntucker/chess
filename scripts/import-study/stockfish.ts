/**
 * Stockfish as the app runs it (the same build), in Node, for the engine
 * check (./engineCheck), with a smaller search than the app's (`CHECK_SEARCH`).
 * Each position's evaluation is cached, so a rerun searches only new positions.
 */
import {
  attachStockfish,
  type Connection,
  type SearchBudget,
  stockfishAnalysis,
} from '@/stockfish/engine';
import { type NodeEngine, sendTo, startNodeEngine } from '@/stockfish/node';

import type { EngineEvaluation, Evaluate } from './engineCheck';
import { appendJsonLine, readJsonLines } from './jsonLines';

/**
 * The engine check's search: the best move, from 100,000 positions (about
 * depth 14 to 16). A lesson checks about 15,000 positions, which would take
 * about 14 hours at the app's search (`APP_SEARCH`); the check only needs to
 * tell a mistake from a sound move.
 */
const CHECK_SEARCH: SearchBudget = { ranks: 1, nodes: 100_000 };

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
    connection = attachStockfish(
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

  const cached = new Map(
    (readJsonLines(cacheFile) as { key: string; evaluation: EngineEvaluation }[]).map(
      ({ key, evaluation }) => [key, evaluation],
    ),
  );
  let searched = 0;
  const evaluate: Evaluate = async (line, key) => {
    const known = cached.get(key);
    if (known) return known;
    const {
      lines: [first],
    } = await stockfishAnalysis(line);
    const evaluation = { ...first.evaluation, ...(first.uci && { best: first.uci }) };
    cached.set(key, evaluation);
    appendJsonLine(cacheFile, { key, evaluation });
    if (++searched % 100 === 0) console.log(`engine check: ${searched} positions searched`);
    return evaluation;
  };
  return {
    evaluate,
    stop() {
      connection?.detach();
      engine?.terminate?.();
    },
  };
}

function giveUp(error: unknown): never {
  console.error(error);
  process.exit(1);
}
