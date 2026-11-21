// Runs in the native project, for Node's Response and streams, which the web
// project's jsdom lacks; Cache Storage is faked below.
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TransformStream } from 'node:stream/web';

import type { DownloadFailure } from '@/resources/download';

import { loadFullStockfish } from './full';

// Small files, so a download is a few chunks.
jest.mock('./fullFiles', () => ({
  FULL_LOADER: 'engine.js',
  FULL_WASM: 'engine.wasm',
  FULL_WASM_BYTES: 200,
  LIVE_FOLDER: 'https://live.test/chess/stockfish/',
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
  reports = [];
  // Node's own, which its Response's body pipes through; React Native's
  // preset replaces the global with another kind.
  Object.assign(globalThis, { caches: fakeCaches, TransformStream });
  jest.spyOn(globalThis, 'fetch').mockImplementation(fakeFetch as typeof fetch);
});
afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
  jest.restoreAllMocks();
});

/** What `report` heard, as `percent` or `percent failure`. */
let reports: string[] = [];
const report = (percent: number, failure?: DownloadFailure) =>
  reports.push(failure ? `${percent} ${failure}` : `${percent}`);
const load = (folder = `${ORIGIN}/chess/stockfish/`) =>
  loadFullStockfish(folder, new AbortController().signal, report);

describe('loadFullStockfish', () => {
  it('downloads the files once, telling how much has arrived by the percent, then reads them from the cache', async () => {
    const files = (await load())!;
    expect(files.loader).toBe('loader');
    expect(await files.wasm.text()).toBe(WHOLE.join(''));
    // Each percent as it arrives, then all of it once the files are in hand.
    expect(reports).toEqual(['50', '100', '100']);
    expect(fetched).toEqual([
      `${ORIGIN}/chess/stockfish/engine.js`,
      `${ORIGIN}/chess/stockfish/engine.wasm`,
    ]);

    // Kept under the live site's address, wherever they came from: an Android
    // web view's own address is file://, which Cache Storage can't key.
    expect([...stored.get('opening-night-engine:engine.wasm:200')!.keys()].sort()).toEqual([
      'https://live.test/chess/stockfish/engine.js',
      'https://live.test/chess/stockfish/engine.wasm',
    ]);

    fetched.length = 0;
    reports = [];
    const again = (await load())!;
    expect(fetched).toEqual([]);
    expect(again.loader).toBe('loader');
    expect(await again.wasm.text()).toBe(WHOLE.join(''));
    expect(reports).toEqual(['100']);
  });

  it('tells only the chunks that reach another whole percent', async () => {
    wasmChunks = ['a', 'b', 'c', 'z'.repeat(197)];
    await load();
    // 0%, 1%, (still 1%), 100%, then done.
    expect(reports).toEqual(['0', '1', '100', '100']);
  });

  it("takes a WebAssembly of another size for a newer build's, and keeps nothing", async () => {
    wasmChunks = WHOLE.slice(0, 1);
    expect(await load()).toBeUndefined();
    wasmChunks = [...WHOLE, 'z'];
    expect(await load()).toBeUndefined();
    expect(reports.filter((said) => said.includes(' '))).toEqual(['0 newVersion', '0 newVersion']);
    fetched.length = 0;
    wasmChunks = WHOLE;
    await load();
    expect(fetched).toHaveLength(2);
  });

  it("takes a folder without the build's files for a newer build's", async () => {
    expect(await load(`${ORIGIN}/elsewhere/`)).toBeUndefined();
    expect(reports).toEqual(['0 newVersion']);
  });

  it('says it tries again, and fails, when the site answers with another error', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((async () => new Response('', { status: 503 })) as typeof fetch);
    await expect(load()).rejects.toThrow('HTTP 503');
    expect(reports).toEqual(['0 retrying']);
  });

  it('reports nothing once aborted', async () => {
    const stop = new AbortController();
    stop.abort();
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('aborted'));
    await expect(
      loadFullStockfish(`${ORIGIN}/chess/stockfish/`, stop.signal, report),
    ).rejects.toThrow('aborted');
    expect(reports).toEqual([]);
  });

  it('keeps each build apart, by its name and size, and drops the others once the new one is kept', async () => {
    stored.set('opening-night-engine:stockfish-18-single.wasm', new Map([['old', 'x']]));
    stored.set('opening-night-engine:engine.wasm:100', new Map([['old', 'x']]));
    stored.set('another-app', new Map());
    await load();
    expect([...stored.keys()]).toEqual(['another-app', 'opening-night-engine:engine.wasm:200']);
  });

  it("still starts the engine when the cache can't be read or keep the files", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const broken = {
      match: async () => {
        throw new Error('unreadable');
      },
      put: async () => {
        throw new Error('full');
      },
    };
    Object.assign(globalThis, { caches: { ...fakeCaches, open: async () => broken } });
    expect((await load())?.loader).toBe('loader');

    Object.assign(globalThis, {
      caches: {
        ...fakeCaches,
        open: async () => {
          throw new Error('blocked');
        },
      },
    });
    expect((await load())?.loader).toBe('loader');
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it('downloads every time where the browser has no cache', async () => {
    delete (globalThis as { caches?: unknown }).caches;
    await load();
    await load();
    expect(fetched).toHaveLength(4);
  });
});
