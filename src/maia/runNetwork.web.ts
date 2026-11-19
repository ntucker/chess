import { assetUrl } from '@/files/assetUrl';

import type { MaiaRequest, MaiaResponse } from './maia.worker';
import { MODELS } from './models';
import type { MaiaRating } from './ratings';
import type { NetworkOutput } from './network';

let worker: Worker | undefined;
let nextId = 0;
interface Pending {
  resolve(output: NetworkOutput): void;
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
    if ('output' in data) request?.resolve(data.output);
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

/** `forward` for `rating`'s network, run in a Web Worker. */
export function runNetwork(rating: MaiaRating, planes: Float32Array): Promise<NetworkOutput> {
  const url = assetUrl(MODELS[rating]);
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, url, planes } satisfies MaiaRequest, [planes.buffer]);
  });
}
