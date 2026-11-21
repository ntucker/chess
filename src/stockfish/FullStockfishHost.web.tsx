import { useReportFullStockfishDownload } from '@/resources/download';

import { fullStockfish } from './engine';
import { loadFullStockfish } from './full';
import { PREVIEW_FOLDER } from './fullFiles';
import { useWorkerHost } from './StockfishHost.web';

/**
 * Runs full Stockfish in a Web Worker for as long as it's mounted, and
 * connects it to `fullStockfish`. Its files download on its first start and
 * the browser keeps them; the download's progress goes into the store
 * (`Download`) for the opponent picker to show (`loadFullStockfish`).
 */
export function FullStockfishHost() {
  const report = useReportFullStockfishDownload();
  useWorkerHost(fullStockfish, (signal) => loadFullStockfish(folder(), signal, report));
  return null;
}

/** Where the files download from: the live site's folder for a preview that shares it, else the page's own site's. */
function folder() {
  const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
  return PREVIEW_FOLDER || new URL(`${base}/stockfish/`, location.origin).href;
}
