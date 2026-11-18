import { Asset } from 'expo-asset';

import type { MaiaRequest, MaiaResponse } from './maia.worker';
import { type MaiaRating, MODELS } from './models';

let worker: Worker | undefined;
let nextId = 0;
interface Pending {
  resolve(logits: Float32Array): void;
  reject(error: Error): void;
}
const pending = new Map<number, Pending>();

/** The worker that runs the network, started on first use. */
function getWorker(): Worker {
  if (worker) return worker;
  const started = new Worker(new URL('./maia.worker.ts', import.meta.url));
  started.onmessage = ({ data }: MessageEvent<MaiaResponse>) => {
    const request = pending.get(data.id);
    pending.delete(data.id);
    if ('logits' in data) request?.resolve(data.logits);
    else request?.reject(new Error(data.error));
  };
  started.onerror = (event) => {
    // A worker that fails to start or crashes answers nothing: fail every
    // request and start a new worker next time.
    for (const request of pending.values()) request.reject(new Error(event.message));
    pending.clear();
    started.terminate();
    worker = undefined;
  };
  return (worker = started);
}

/** `policyLogits` for `rating`'s network, run in a Web Worker. */
export function runNetwork(rating: MaiaRating, planes: Float32Array): Promise<Float32Array> {
  // The worker may run from a blob: URL, so give it an absolute address.
  const url = new URL(Asset.fromModule(MODELS[rating]).uri, location.href).href;
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, url, planes } satisfies MaiaRequest, [planes.buffer]);
  });
}
