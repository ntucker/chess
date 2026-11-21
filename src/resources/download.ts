import { useController, useQuery } from '@data-client/react';
import { Entity } from '@data-client/rest';

import { FULL_WASM_BYTES } from '@/stockfish/fullFiles';

/**
 * How far a download of a big file the app fetches only when first needed
 * has got, as its host reports it (FullStockfishHost, for full Stockfish).
 * Kept while the app runs; none means nothing is downloading.
 */
export class Download extends Entity {
  readonly id: string = '';
  /** How many bytes have arrived. */
  readonly received: number = 0;
  /** How many there are in all. */
  readonly total: number = 0;
  /** The last try failed; the host tries again. */
  readonly failed: boolean = false;

  pk() {
    return this.id;
  }

  static key = 'Download';
}

/** The download of full Stockfish's files (src/stockfish/full.ts). */
export const FULL_STOCKFISH_DOWNLOAD = { id: 'stockfish-full' };

/**
 * Full Stockfish's download while it runs or after it failed; undefined once
 * the files are in hand, or before anything was asked for.
 */
export function useFullStockfishDownload(): Download | undefined {
  const download = useQuery(Download, FULL_STOCKFISH_DOWNLOAD);
  return download && (download.failed || download.received < download.total) ? download : undefined;
}

/**
 * How full Stockfish's host reports its download: how many bytes have
 * arrived (all of them once the files are in hand, from the cache too), or
 * that it failed.
 */
export function useReportFullStockfishDownload() {
  const ctrl = useController();
  return (received: number, failed = false) =>
    ctrl.set(Download, FULL_STOCKFISH_DOWNLOAD, {
      ...FULL_STOCKFISH_DOWNLOAD,
      received,
      total: FULL_WASM_BYTES,
      failed,
    });
}
