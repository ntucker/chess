import { explainLoadFailure, NewVersionError } from '@/files/newVersion';
import { useReportFullStockfishDownload } from '@/resources/download';

import { fullStockfish } from './engine';
import { type EngineFiles, loadFullStockfish } from './full';
import { FULL_WASM_BYTES } from './fullFiles';
import { useWorkerHost } from './StockfishHost.web';

/**
 * Runs full Stockfish in a Web Worker for as long as it's mounted, and
 * connects it to `fullStockfish`. Its files download from the page's own
 * site on its first start and the browser keeps them (`loadFullStockfish`);
 * the download's progress goes into the store (`Download`) for the opponent
 * picker to show.
 */
export function FullStockfishHost() {
  const report = useReportFullStockfishDownload();
  const load = async (signal: AbortSignal): Promise<EngineFiles> => {
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    try {
      const files = await loadFullStockfish(
        new URL(`${base}/stockfish/`, location.origin).href,
        signal,
        report,
      );
      report(FULL_WASM_BYTES);
      return files;
    } catch (error) {
      if (signal.aborted) throw error;
      // Its files are named for their Stockfish build, which a newer build
      // of the site may have replaced.
      const explained = await explainLoadFailure(error);
      report(0, explained instanceof NewVersionError ? 'newVersion' : 'retrying');
      throw explained;
    }
  };
  useWorkerHost(fullStockfish, load);
  return null;
}
