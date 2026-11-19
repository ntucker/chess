import { beforeEach, describe, expect, it } from '@jest/globals';

import { startStockfishWorker } from './worker';

// startStockfishWorker against a stand-in Worker and Blob addresses, since
// Jest has neither.
class FakeWorker {
  static last: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  readonly sent: unknown[] = [];
  terminated = false;
  constructor(readonly url: string) {
    FakeWorker.last = this;
  }
  postMessage(message: unknown) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
}

/** Blob addresses created and not yet revoked. */
let live: Set<string>;
/** Every address passed to URL.revokeObjectURL. */
let revoked: string[];
let created: number;

beforeEach(() => {
  live = new Set();
  revoked = [];
  created = 0;
  Object.assign(globalThis, { Worker: FakeWorker });
  URL.createObjectURL = () => {
    const url = `blob:${++created}`;
    live.add(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    revoked.push(url);
    live.delete(url);
  };
});

const start = (
  onLine: (line: string) => void = () => {},
  onError: (message: string) => void = () => {},
) => startStockfishWorker('loader', new Blob(['wasm']), onLine, onError);

describe('startStockfishWorker', () => {
  it('passes the WebAssembly address in the hash, and frees both files once the engine prints', () => {
    const lines: string[] = [];
    start((line) => lines.push(line));
    expect(FakeWorker.last.url).toBe(`blob:1#${encodeURIComponent('blob:2')}`);
    expect(live.size).toBe(2);
    FakeWorker.last.onmessage?.({ data: 'uciok' });
    expect(lines).toEqual(['uciok']);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
  });

  it('filters what the engine prints (forwardNeededLines)', () => {
    const lines: string[] = [];
    start((line) => lines.push(line));
    for (const data of ['Stockfish 19', 'uciok']) FakeWorker.last.onmessage?.({ data });
    expect(lines).toEqual(['uciok']);
  });

  it('sends commands to the worker', () => {
    start().send('uci');
    expect(FakeWorker.last.sent).toEqual(['uci']);
  });

  it('stops a worker that crashes and frees its files before reporting it', () => {
    const reported: string[] = [];
    start(undefined, (message) =>
      reported.push(`${message}, stopped: ${FakeWorker.last.terminated}, files: ${live.size}`),
    );
    FakeWorker.last.onerror?.({ message: 'out of memory' });
    expect(reported).toEqual(['out of memory, stopped: true, files: 0']);
    expect(revoked).toEqual(['blob:1', 'blob:2']);
  });

  it('reports a crash with no message as stopped', () => {
    const reported: string[] = [];
    start(undefined, (message) => reported.push(message));
    FakeWorker.last.onerror?.({ message: '' });
    expect(reported).toEqual(['Stockfish stopped']);
  });
});
