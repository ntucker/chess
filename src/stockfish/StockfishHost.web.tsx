import { useEffect } from 'react';

import { assetUrl } from '@/files/assetUrl';

import { type Connection, liteStockfish, type Stockfish } from './engine';
import { LOADER, WASM } from './files';
import type { EngineFiles } from './full';
import { useRestarts } from './restarts';
import { startStockfishWorker, type StockfishWorker } from './worker';

/**
 * Runs Stockfish lite in a Web Worker for as long as it's mounted and
 * connects it to `liteStockfish`, starting a new worker when one crashes,
 * stops answering or can't start. Unmounting it stops the worker.
 */
export function StockfishHost() {
  useWorkerHost(liteStockfish, loadLite);
  return null;
}

/**
 * Runs a Stockfish build in a Web Worker while the calling component is
 * mounted, from the files `load` fetches, and connects it to `engine`. A
 * worker that crashes, stops answering, or whose files can't be loaded is
 * replaced after a pause (`useRestarts`), which loads the files again.
 */
export function useWorkerHost(
  engine: Stockfish,
  load: (signal: AbortSignal) => Promise<EngineFiles>,
) {
  const [running, supervisor] = useRestarts();
  useEffect(() => {
    if (!running) return;
    let worker: StockfishWorker | undefined;
    let connection: Connection | undefined;
    // Aborts the downloads, and tells the start-up after them that the host stopped.
    const stop = new AbortController();
    (async () => {
      // Loaded here, not by the worker, so the engine's time to answer
      // (engine.ts) starts once it has its files, however slow the network.
      const { loader, wasm } = await load(stop.signal);
      if (stop.signal.aborted) return;
      worker = startStockfishWorker(
        loader,
        wasm,
        (line) => connection?.receive(line),
        (message) => connection?.fail(message),
      );
      connection = engine.attach(worker.send, supervisor);
    })().catch((error: unknown) => {
      if (stop.signal.aborted) return;
      console.error(error);
      supervisor.failed();
    });
    return () => {
      stop.abort();
      worker?.terminate();
      connection?.detach();
    };
  }, [running, supervisor, engine, load]);
}

/** Stockfish lite's files, which ship with the app. */
async function loadLite(signal: AbortSignal): Promise<EngineFiles> {
  const [loader, wasm] = await Promise.all([
    download(LOADER, signal).then((file) => file.text()),
    download(WASM, signal).then((file) => file.blob()),
  ]);
  return { loader, wasm: new Blob([wasm], { type: 'application/wasm' }) };
}

async function download(asset: number, signal: AbortSignal): Promise<Response> {
  const url = assetUrl(asset);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}
