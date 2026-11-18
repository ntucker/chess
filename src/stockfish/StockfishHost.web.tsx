import { useEffect } from 'react';

import { assetUrl } from '@/files/assetUrl';

import { attachStockfish, type Connection, failStockfish } from './engine';
import { LOADER, WASM } from './files';
import { startStockfishWorker, type StockfishWorker } from './worker';

/**
 * Runs Stockfish in a Web Worker for as long as it's mounted and connects it
 * to stockfishEvaluation. Unmounting it stops the worker.
 */
export function StockfishHost() {
  useEffect(() => {
    let engine: StockfishWorker | undefined;
    let connection: Connection | undefined;
    let unmounted = false;
    const fail = (error: Error) => {
      if (unmounted) return;
      console.error(error);
      failStockfish(error);
    };
    (async () => {
      const response = await fetch(assetUrl(LOADER));
      if (!response.ok) throw new Error(`Stockfish's loader: HTTP ${response.status}`);
      const loader = await response.text();
      if (unmounted) return;
      const started = startStockfishWorker(
        loader,
        assetUrl(WASM),
        (line) => connection?.receive(line),
        (message) => fail(new Error(message)),
      );
      connection = attachStockfish(started.send);
      engine = started;
    })().catch(fail);
    return () => {
      unmounted = true;
      engine?.terminate();
      connection?.detach();
    };
  }, []);
  return null;
}
