import { Asset } from 'expo-asset';

import type { MaiaRequest, MaiaResponse } from './maia.worker';
import { type MaiaRating, MODELS } from './models';

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve(move: string): void; reject(error: Error): void }>();

/** The worker that runs Maia, started on first use. */
function getWorker(): Worker {
  if (worker) return worker;
  const started = new Worker(new URL('./maia.worker.ts', import.meta.url));
  started.onmessage = ({ data }: MessageEvent<MaiaResponse>) => {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if ('move' in data) request?.resolve(data.move);
    else request?.reject(new Error(data.error));
  };
  started.onerror = (event) => {
    // A worker that fails to start or crashes answers nothing: fail every
    // request and start a new worker next time.
    for (const request of pending.values()) request.reject(new Error(event.message));
    pending.clear();
    worker = undefined;
  };
  return (worker = started);
}

/**
 * Maia's move after `line` (see `chooseMove`), worked out in a Web Worker so
 * the page keeps responding while the network runs.
 */
export function maiaMove(rating: MaiaRating, line: readonly string[]): Promise<string> {
  // The worker may run from a blob: URL, so give it an absolute address.
  const url = new URL(Asset.fromModule(MODELS[rating]).uri, location.href).href;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, url, line } satisfies MaiaRequest);
  });
}
