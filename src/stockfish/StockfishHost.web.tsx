import { useEffect } from 'react';

import { assetUrl } from '@/files/assetUrl';

import { attachStockfish, type Connection } from './engine';
import { LOADER, WASM } from './files';
import { useRestarts } from './restarts';
import { startStockfishWorker, type StockfishWorker } from './worker';

/**
 * Runs Stockfish in a Web Worker for as long as it's mounted and connects it
 * to stockfishEvaluation, starting a new worker when one crashes, stops
 * answering or can't start. Unmounting it stops the worker.
 */
export function StockfishHost() {
  const [running, supervisor] = useRestarts();
  useEffect(() => {
    if (!running) return;
    let engine: StockfishWorker | undefined;
    let connection: Connection | undefined;
    let stopped = false;
    (async () => {
      const response = await fetch(assetUrl(LOADER));
      if (!response.ok) throw new Error(`Stockfish's loader: HTTP ${response.status}`);
      const loader = await response.text();
      if (stopped) return;
      engine = startStockfishWorker(
        loader,
        assetUrl(WASM),
        (line) => connection?.receive(line),
        (message) => connection?.fail(message),
      );
      connection = attachStockfish(engine.send, supervisor);
    })().catch((error: unknown) => {
      if (stopped) return;
      console.error(error);
      supervisor.failed();
    });
    return () => {
      stopped = true;
      engine?.terminate();
      connection?.detach();
    };
  }, [running, supervisor]);
  return null;
}
