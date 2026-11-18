import { Asset } from 'expo-asset';
import { useEffect } from 'react';

import { attachStockfish, type Connection } from './engine';
import { LOADER, WASM } from './files';
import { startStockfishWorker } from './worker';

/** An asset's address, absolute so the worker can fetch it from a Blob. */
const assetUrl = (module: number) => new URL(Asset.fromModule(module).uri, location.href).href;

/**
 * Runs Stockfish in a Web Worker for as long as it's mounted and connects it
 * to stockfishEvaluation. Unmounting it stops the worker.
 */
export function StockfishHost() {
  useEffect(() => {
    let worker: Worker | undefined;
    let connection: Connection | undefined;
    let unmounted = false;
    (async () => {
      const response = await fetch(assetUrl(LOADER));
      if (!response.ok) throw new Error(`Stockfish's loader: HTTP ${response.status}`);
      const loader = await response.text();
      if (unmounted) return;
      const started = startStockfishWorker(loader, assetUrl(WASM), (line) =>
        connection?.receive(line),
      );
      // A worker that fails to start or crashes fails what's waiting for it.
      started.onerror = () => connection?.detach();
      connection = attachStockfish((command) => started.postMessage(command));
      worker = started;
    })().catch((error: unknown) => console.error(error));
    return () => {
      unmounted = true;
      worker?.terminate();
      connection?.detach();
    };
  }, []);
  return null;
}
