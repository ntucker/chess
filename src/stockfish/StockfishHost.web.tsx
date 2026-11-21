import { useEffect, useEffectEvent } from 'react';

import { assetUrl } from '@/files/assetUrl';
import { fetchOk } from '@/files/fetchOk';
import { type Needs, NewVersionError } from '@/files/newVersion';

import { type Connection, liteStockfish, type Stockfish } from './engine';
import { LOADER, WASM } from './files';
import { useRestarts } from './restarts';
import { type EngineFiles, startStockfishWorker, type StockfishWorker } from './worker';

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
 * replaced after a pause (`useRestarts`), which loads the files again. When
 * `load` rejects with a NewVersionError, trying again can't help: the engine
 * stays off, and fails what's asked of it (`Stockfish.unavailable`) with
 * `needs`, where a reload can't help either.
 */
export function useWorkerHost(
  engine: Stockfish,
  load: (signal: AbortSignal) => Promise<EngineFiles>,
  needs?: Needs,
) {
  const [running, supervisor] = useRestarts();
  // The latest `load`, so a new function each render doesn't restart the engine.
  const loadFiles = useEffectEvent(load);
  useEffect(() => {
    if (!running) return;
    let worker: StockfishWorker | undefined;
    let connection: Connection | undefined;
    // Aborts the downloads, and tells the start-up after them that the host stopped.
    const stop = new AbortController();
    (async () => {
      // Loaded here, not by the worker, so the engine's time to answer
      // (engine.ts) starts once it has its files, however slow the network.
      const files = await loadFiles(stop.signal);
      if (stop.signal.aborted) return;
      worker = startStockfishWorker(
        files.loader,
        files.wasm,
        (line) => connection?.receive(line),
        (message) => connection?.fail(message),
      );
      connection = engine.attach(worker.send, supervisor);
    })().catch((error: unknown) => {
      if (stop.signal.aborted) return;
      console.error(error);
      if (error instanceof NewVersionError)
        engine.unavailable(new NewVersionError({ cause: error, needs }));
      else supervisor.failed();
    });
    return () => {
      stop.abort();
      worker?.terminate();
      connection?.detach();
    };
  }, [running, supervisor, engine, needs]);
}

/** Stockfish lite's files, which ship with the app. */
async function loadLite(signal: AbortSignal): Promise<EngineFiles> {
  const [loader, wasm] = await Promise.all([
    fetchOk(assetUrl(LOADER), { signal }).then((file) => file.text()),
    fetchOk(assetUrl(WASM), { signal }).then((file) => file.blob()),
  ]);
  return { loader, wasm };
}
