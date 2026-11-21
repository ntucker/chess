// Runs in the native project, for Node's Response and streams, which the web
// project's jsdom lacks; the page's address and Cache Storage are faked below.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { loadFullStockfish } from './full';

// Small files, so a download is a few chunks.
jest.mock('./fullFiles', () => ({
  FULL_LOADER: 'engine.js',
  FULL_WASM: 'engine.wasm',
  FULL_WASM_BYTES: 200,
}));

const ORIGIN = 'https://example.test';

/** The browser's Cache Storage, in memory: cache name to (address to body). */
const stored = new Map<string, Map<string, string>>();
const fakeCaches = {
  async open(name: string) {
    const cache = stored.get(name) ?? new Map<string, string>();
    stored.set(name, cache);
    return {
      async match(key: string) {
        const body = cache.get(key);
        return body === undefined ? undefined : new Response(body);
      },
      async put(key: string, response: Response) {
        cache.set(key, await response.text());
      },
    };
  },
  keys: async () => [...stored.keys()],
  delete: async (name: string) => stored.delete(name),
};

/** The WebAssembly the site serves, in the chunks its body arrives in. */
const WHOLE = ['x'.repeat(100), 'y'.repeat(100)];
let wasmChunks = WHOLE;
const fetched: string[] = [];
const fakeFetch = async (url: string) => {
  fetched.push(url);
  if (url.endsWith('/stockfish/engine.js')) return new Response('loader');
  if (!url.endsWith('/stockfish/engine.wasm')) return new Response('', { status: 404 });
  const encoder = new TextEncoder();
  const chunks = [...wasmChunks];
  return new Response(
    new ReadableStream({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      },
    }),
  );
};

beforeEach(() => {
  stored.clear();
  fetched.length = 0;
  wasmChunks = WHOLE;
  Object.assign(globalThis, { caches: fakeCaches, location: { origin: ORIGIN } });
  jest.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch as typeof fetch);
});
afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
  delete (globalThis as { location?: unknown }).location;
  jest.restoreAllMocks();
});

const load = (onProgress: (received: number) => void = () => {}) =>
  loadFullStockfish(`${ORIGIN}/chess/stockfish/`, new AbortController().signal, onProgress);

describe('loadFullStockfish', () => {
  it('downloads the files once, telling how much has arrived by the percent, then reads them from the cache', async () => {
    const progress: number[] = [];
    const files = await load((received) => progress.push(received));
    expect(files.loader).toBe('loader');
    expect(await files.wasm.text()).toBe(WHOLE.join(''));
    expect(files.wasm.type).toBe('application/wasm');
    expect(progress).toEqual([100, 200]);
    expect(fetched).toEqual([
      `${ORIGIN}/chess/stockfish/engine.js`,
      `${ORIGIN}/chess/stockfish/engine.wasm`,
    ]);

    fetched.length = 0;
    const again = await load();
    expect(fetched).toEqual([]);
    expect(again.loader).toBe('loader');
    expect(await again.wasm.text()).toBe(WHOLE.join(''));
  });

  it('tells only the chunks that reach another whole percent', async () => {
    wasmChunks = ['a', 'b', 'c', 'z'.repeat(197)];
    const progress: number[] = [];
    await load((received) => progress.push(received));
    // 0%, 1%, (still 1%), 100%.
    expect(progress).toEqual([1, 2, 200]);
  });

  it('fails a download that comes up short, and keeps nothing', async () => {
    wasmChunks = WHOLE.slice(0, 1);
    await expect(load()).rejects.toThrow('got 100 of 200 bytes');
    fetched.length = 0;
    wasmChunks = WHOLE;
    await load();
    expect(fetched).toHaveLength(2);
  });

  it('drops the files of an older Stockfish build once the new one is kept', async () => {
    stored.set('opening-night-engine:stockfish-18-single.wasm', new Map([['old', 'x']]));
    stored.set('another-app', new Map());
    await load();
    expect([...stored.keys()]).toEqual(['another-app', 'opening-night-engine:engine.wasm']);
  });

  it('downloads every time where the browser has no cache', async () => {
    delete (globalThis as { caches?: unknown }).caches;
    await load();
    await load();
    expect(fetched).toHaveLength(4);
  });
});
