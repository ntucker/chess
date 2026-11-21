// Downloads full Stockfish's files (fullFiles.ts) once: the browser keeps
// them in Cache Storage, so later visits start the engine from there. On the
// web the page downloads them from its own site; previews of pull requests
// share the live site's origin and so its copy, since a file's name changes
// with its Stockfish build. On Android the hidden web view that runs the
// engine (EngineView) downloads them from the live site and keeps them in
// its own cache. Uses only the DOM, for that web view.
import { FULL_LOADER, FULL_WASM, FULL_WASM_BYTES } from './fullFiles';

/** The files a Web Worker starts the engine from (`startStockfishWorker`). */
export interface EngineFiles {
  readonly loader: string;
  readonly wasm: Blob;
}

/** All of the app's Stockfish caches start with this; each build's has its own name. */
const CACHE_PREFIX = 'opening-night-engine:';
const CACHE = `${CACHE_PREFIX}${FULL_WASM}`;

/**
 * Full Stockfish's loader and WebAssembly: from the browser's cache when an
 * earlier visit downloaded them, else downloaded from `folder` (an absolute
 * address ending in `/`) and then cached. While the WebAssembly downloads,
 * `onProgress` hears how many of its `FULL_WASM_BYTES` have arrived, each
 * time another whole percent has. Rejects if the site can't serve them or a
 * download comes up short, and when `signal` aborts.
 */
export async function loadFullStockfish(
  folder: string,
  signal: AbortSignal,
  onProgress: (received: number) => void,
): Promise<EngineFiles> {
  // Missing outside a secure context (http:// other than localhost): download every time.
  const cache = await globalThis.caches?.open(CACHE);
  const [cachedLoader, cachedWasm] = await Promise.all(
    [FULL_LOADER, FULL_WASM].map((file) => cache?.match(cacheKey(file))),
  );
  if (cachedLoader && cachedWasm)
    return { loader: await cachedLoader.text(), wasm: await cachedWasm.blob() };

  const [loader, wasm] = await Promise.all([
    download(folder, FULL_LOADER, signal).then((response) => response.text()),
    download(folder, FULL_WASM, signal).then((response) => readWasm(response, onProgress)),
  ]);
  if (cache) {
    await Promise.all([
      cache.put(cacheKey(FULL_LOADER), new Response(loader)),
      cache.put(cacheKey(FULL_WASM), new Response(wasm)),
    ]);
    await dropOtherBuilds();
  }
  return { loader, wasm };
}

/** Where a file is kept in the cache: at the origin's root, whichever page or preview downloaded it. */
const cacheKey = (file: string) => new URL(`/${CACHE}/${file}`, location.origin).href;

async function download(folder: string, file: string, signal: AbortSignal): Promise<Response> {
  const url = new URL(file, folder).href;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response;
}

/**
 * The WebAssembly from `response`, telling `onProgress` as each whole
 * percent arrives (a call for every chunk would be about 1,500, each a
 * message from Android's web view and a render). Counted in the bytes the
 * body decodes to, since the site may compress it.
 */
async function readWasm(response: Response, onProgress: (received: number) => void): Promise<Blob> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let received = 0;
  let percent = -1;
  const reader = response.body!.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    chunks.push(read.value);
    received += read.value.length;
    const now = Math.floor((received / FULL_WASM_BYTES) * 100);
    if (now === percent) continue;
    percent = now;
    onProgress(received);
  }
  if (received !== FULL_WASM_BYTES)
    throw new Error(`Full Stockfish: got ${received} of ${FULL_WASM_BYTES} bytes`);
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
