/**
 * Stockfish as the app runs it (the same build and search), in Node, for the
 * engine check (./engineCheck). Each position's evaluation is cached, so a
 * rerun searches only new positions.
 */
import type { Evaluation } from '@/evaluation/evaluation';
import { attachStockfish, type Connection, stockfishEvaluation } from '@/stockfish/engine';
import { type NodeEngine, sendTo, startNodeEngine } from '@/stockfish/testing';

import type { Evaluate } from './engineCheck';
import { appendJsonLine, readJsonLines } from './jsonLines';

/**
 * Starts the engine. One that crashes or stops answering is replaced; a
 * position that stops three engines rejects its search, which stops the import.
 */
export async function nodeStockfish(
  cacheFile: string,
): Promise<{ evaluate: Evaluate; stop: () => void }> {
  let engine: NodeEngine | undefined;
  let connection: Connection | undefined;
  const connect = async () => {
    engine?.terminate?.();
    const started = await startNodeEngine();
    engine = started;
    connection = attachStockfish(sendTo(started), {
      ready() {},
      failed: () => void connect(),
    });
    const attached = connection;
    started.listener = (line) => attached.receive(line);
  };
  await connect();

  const cached = new Map(
    (readJsonLines(cacheFile) as { key: string; evaluation: Evaluation }[]).map(
      ({ key, evaluation }) => [key, evaluation],
    ),
  );
  let searched = 0;
  const evaluate: Evaluate = async (line, key) => {
    const known = cached.get(key);
    if (known) return known;
    const evaluation = await stockfishEvaluation(line);
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
