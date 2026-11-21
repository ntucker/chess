import { useReportFullStockfishDownload } from '@/resources/download';

import { fullStockfish } from './engine';
import { LIVE_FOLDER } from './fullFiles';
import { HiddenHost } from './StockfishHost';

/**
 * Runs full Stockfish for as long as it's mounted, in a hidden web view, and
 * connects it to `fullStockfish`. Its 99 MB is too much for the app to hand
 * the web view as it does lite's, so the web view downloads the files from
 * the live site itself on its first start and keeps them in its cache
 * (`loadFullStockfish`); the download's progress goes into the store
 * (`Download`) for the opponent picker to show.
 */
export function FullStockfishHost() {
  const report = useReportFullStockfishDownload();
  return <HiddenHost engine={fullStockfish} full={{ folder: LIVE_FOLDER, report }} />;
}
