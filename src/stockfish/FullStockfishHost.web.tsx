import { useReportFullStockfishDownload } from '@/resources/download';

import { fullStockfish } from './engine';
import { type EngineFiles, loadFullStockfish, OtherBuildError } from './full';
import { FULL_WASM_BYTES } from './fullFiles';
import { useWorkerHost } from './StockfishHost.web';

/**
 * Runs full Stockfish in a Web Worker for as long as it's mounted, and
 * connects it to `fullStockfish`. Its files download on its first start and
 * the browser keeps them (`loadFullStockfish`); the download's progress goes
 * into the store (`Download`) for the opponent picker to show. Once the site
 * serves another build, a newer build of the page replaced this one: only a
 * reload can start the engine.
 */
export function FullStockfishHost() {
  const report = useReportFullStockfishDownload();
  const load = async (signal: AbortSignal): Promise<EngineFiles | undefined> => {
    try {
      const files = await loadFullStockfish(folder(), signal, report);
      report(FULL_WASM_BYTES);
      return files;
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof OtherBuildError) {
        report(0, 'newVersion');
        return undefined;
      }
      report(0, 'retrying');
      throw error;
    }
  };
  useWorkerHost(fullStockfish, load);
  return null;
}

/**
 * Where the files download from: the folder a preview's build names, which
 * is the live site's when that serves the same build (README.md, Web
 * deploys), else the page's own site.
 */
function folder() {
  const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
  return (
    process.env.EXPO_PUBLIC_STOCKFISH_FOLDER || new URL(`${base}/stockfish/`, location.origin).href
  );
}
