// Downloads full Stockfish's files (fullFiles.ts) once: the browser keeps
// them in Cache Storage, so later visits start the engine from there. On the
// web the page downloads them from its own site, and previews of pull
// requests from the live site's, unless they change the build (README.md, Web
// deploys); either way the browser keeps one copy for the origin. On Android
// the hidden web view that runs the engine (EngineView) downloads them from
// the live site and keeps them in its own cache. Uses only the DOM, for that
// web view.
import { fetchOk, HttpError } from '@/files/fetchOk';

import { FULL_LOADER, FULL_WASM, FULL_WASM_BYTES } from './fullFiles';

/** The files a Web Worker starts the engine from (`startStockfishWorker`). */
export interface EngineFiles {
  readonly loader: string;
  readonly wasm: Blob;
}

/**
 * All of the app's Stockfish caches start with this; each build's has its own
 * name, from its file's name and size, since a newer package may keep the name.
 */
const CACHE_PREFIX = 'opening-night-engine:';
const CACHE = `${CACHE_PREFIX}${FULL_WASM}:${FULL_WASM_BYTES}`;

/**
 * The folder serves another Stockfish build than the app's: it has no file by
 * this build's name, or the WebAssembly isn't this build's size. Trying again
 * can't help; a newer app can (on the web, reloading the page).
 */
export class OtherBuildError extends Error {
  constructor(options?: ErrorOptions) {
    super(`Full Stockfish: the site serves another build than ${FULL_WASM}`, options);
    this.name = 'OtherBuildError';
  }
}

/**
 * Full Stockfish's loader and WebAssembly: from the browser's cache when an
 * earlier visit downloaded them, else downloaded from `folder` (an absolute
 * address ending in `/`) and then cached. While the WebAssembly downloads,
 * `onProgress` hears how many of its `FULL_WASM_BYTES` have arrived, each
 * time another whole percent has. Rejects with OtherBuildError when the
 * folder serves another build, otherwise when it can't serve them, and when
 * `signal` aborts.
 */
export async function loadFullStockfish(
  folder: string,
  signal: AbortSignal,
  onProgress: (received: number) => void,
): Promise<EngineFiles> {
  const cache = await openCache();
  const cached = cache && (await readCache(cache));
  if (cached) return cached;

  const [loader, wasm] = await Promise.all([
    download(folder, FULL_LOADER, signal).then((response) => response.text()),
    download(folder, FULL_WASM, signal).then((response) => readWasm(response, onProgress)),
  ]);
  if (cache) {
    // A cache that can't keep them (out of space, say) costs the next visit
    // a download, not this one its engine.
    try {
      await Promise.all([
        cache.put(cacheKey(FULL_LOADER), new Response(loader)),
        cache.put(cacheKey(FULL_WASM), new Response(wasm)),
      ]);
      await dropOtherBuilds();
    } catch (error) {
      console.error(error);
    }
  }
  return { loader, wasm };
}

/**
 * The cache the files are kept in, or undefined where there is none (outside
 * a secure context, such as http:// other than localhost) or it can't be
 * opened: then they download every time.
 */
async function openCache(): Promise<Cache | undefined> {
  try {
    return await globalThis.caches?.open(CACHE);
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

/** The files `cache` keeps, or undefined when it lacks one or can't be read. */
async function readCache(cache: Cache): Promise<EngineFiles | undefined> {
  try {
    const [loader, wasm] = await Promise.all(
      [FULL_LOADER, FULL_WASM].map((file) => cache.match(cacheKey(file))),
    );
    if (loader && wasm) return { loader: await loader.text(), wasm: await wasm.blob() };
  } catch (error) {
    console.error(error);
  }
  return undefined;
}

/** Where a file is kept in the cache: at the origin's root, whichever page or preview downloaded it. */
const cacheKey = (file: string) => new URL(`/${CACHE}/${file}`, location.origin).href;

/** `file` from `folder`; a folder without it serves another build. */
const download = (folder: string, file: string, signal: AbortSignal) =>
  fetchOk(new URL(file, folder).href, { signal }).catch((error: unknown) => {
    throw error instanceof HttpError && error.status === 404
      ? new OtherBuildError({ cause: error })
      : error;
  });

/**
 * The WebAssembly from `response`, telling `onProgress` as each whole
 * percent arrives (a call for every chunk would be about 1,500, each a
 * message from Android's web view and a render). Counted in the bytes the
 * body decodes to, since the site may compress it. A body that ends at
 * another size is another build's: one cut off fails the read instead.
 */
async function readWasm(response: Response, onProgress: (received: number) => void): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  let percent = -1;
  const reader = response.body!.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    chunks.push(read.value);
    received += read.value.length;
    if (received > FULL_WASM_BYTES) {
      await reader.cancel();
      throw new OtherBuildError();
    }
    const now = Math.floor((received / FULL_WASM_BYTES) * 100);
    if (now === percent) continue;
    percent = now;
    onProgress(received);
  }
  if (received !== FULL_WASM_BYTES) throw new OtherBuildError();
  return new Blob(chunks, { type: 'application/wasm' });
}

/** Frees the space an older Stockfish build's files took. */
async function dropOtherBuilds() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE)
      .map((name) => caches.delete(name)),
  );
}
