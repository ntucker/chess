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
    const downloads = new AbortController();
    (async () => {
      // Downloaded here, not by the worker, so the engine's time to answer
      // (engine.ts) starts once it has its files, however slow the network.
      const [loader, wasm] = await Promise.all([
        download(LOADER, downloads.signal).then((file) => file.text()),
        download(WASM, downloads.signal).then((file) => file.blob()),
      ]);
      if (stopped) return;
      engine = startStockfishWorker(
        loader,
        new Blob([wasm], { type: 'application/wasm' }),
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
      downloads.abort();
      engine?.terminate();
      connection?.detach();
    };
  }, [running, supervisor]);
  return null;
}

async function download(asset: number, signal: AbortSignal): Promise<Response> {
  const url = assetUrl(asset);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
