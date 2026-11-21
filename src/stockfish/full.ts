// Downloads full Stockfish's files (fullFiles.ts) once: the browser keeps
// them in Cache Storage, so later visits start the engine from there. On the
// web the page downloads them from its own site, and previews of pull
// requests from the live site's, unless they change the build (README.md, Web
// deploys); either way the browser keeps one copy for the origin. On Android
// the hidden web view that runs the engine (EngineView) downloads them from
// the live site and keeps them in its own cache. Uses only the DOM, for that
// web view.
import { fetchOk, HttpError } from '@/files/fetchOk';
import { NewVersionError } from '@/files/newVersion';
import type { ReportDownload } from '@/resources/download';

import { FULL_LOADER, FULL_WASM, FULL_WASM_BYTES, LIVE_FOLDER } from './fullFiles';
import type { EngineFiles } from './worker';

/**
 * All of the app's Stockfish caches start with this; each build's has its own
 * name, from its file's name and size, since a newer package may keep the name.
 */
const CACHE_PREFIX = 'opening-night-engine:';
const CACHE = `${CACHE_PREFIX}${FULL_WASM}:${FULL_WASM_BYTES}`;

/**
 * Full Stockfish's loader and WebAssembly: from the browser's cache when an
 * earlier visit downloaded them, else downloaded from `folder` (an absolute
 * address ending in `/`) and then cached. `report` hears each whole percent
 * of the WebAssembly as it arrives, and 100 once the files are in hand. When the folder
 * serves another build (a NewVersionError: no file by this build's name, or a
 * WebAssembly of another size), trying again can't help, only a newer app (on
 * the web, a reload): it reports `newVersion` and resolves undefined. Any
 * other failure reports `retrying` and rejects; an abort of `signal` rejects
 * without a report.
 */
export async function loadFullStockfish(
  folder: string,
  signal: AbortSignal,
  report: ReportDownload,
): Promise<EngineFiles | undefined> {
  try {
    const files = await getFiles(folder, signal, report);
    report(100);
    return files;
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof NewVersionError) {
      report(0, 'newVersion');
      return undefined;
    }
    report(0, 'retrying');
    throw error;
  }
}

/** The files, from the cache or else downloaded and then cached (`loadFullStockfish`). */
async function getFiles(
  folder: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
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
    if (loader && wasm) {
      const [text, blob] = await Promise.all([loader.text(), wasm.blob()]);
      return { loader: text, wasm: blob };
    }
  } catch (error) {
    console.error(error);
  }
  return undefined;
}

/**
 * Where a file is kept in the cache: under the live site's address, whichever
 * page, preview or web view downloaded it. A release Android web view's page
 * is a file:// address, which Cache Storage refuses as a key.
 */
const cacheKey = (file: string) => new URL(file, LIVE_FOLDER).href;

/** `file` from `folder`; a folder without it serves another build. */
const download = (folder: string, file: string, signal: AbortSignal) =>
  fetchOk(new URL(file, folder).href, { signal }).catch((error: unknown) => {
    throw error instanceof HttpError && error.status === 404
      ? new NewVersionError({ cause: error })
      : error;
  });

/**
 * The WebAssembly from `response`, telling `onProgress` as each whole
 * percent arrives (a call for every chunk would be about 1,500, each a
 * message from Android's web view and a render). Counted in the bytes the
 * body decodes to, since the site may compress it. A body that ends at
 * another size is another build's: one cut off fails the read instead. The
 * browser gathers the body into the Blob, so the page never holds a second
 * copy of its 99 MB.
 */
async function readWasm(response: Response, onProgress: (percent: number) => void): Promise<Blob> {
  let received = 0;
  let percent = -1;
  let otherSize = false;
  const counted = response.body!.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        received += chunk.length;
        if (received > FULL_WASM_BYTES) failSize();
        controller.enqueue(chunk);
        const whole = Math.floor((received / FULL_WASM_BYTES) * 100);
        if (whole === percent) return;
        percent = whole;
        onProgress(whole);
      },
      flush() {
        if (received !== FULL_WASM_BYTES) failSize();
      },
    }),
  );
  function failSize(): never {
    otherSize = true;
    throw new Error(`Full Stockfish: got ${received} bytes, not ${FULL_WASM_BYTES}`);
  }
  try {
    return await new Response(counted).blob();
  } catch (error) {
    throw otherSize ? new NewVersionError({ cause: error }) : error;
  }
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
