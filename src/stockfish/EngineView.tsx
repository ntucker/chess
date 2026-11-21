'use dom';

// The hidden web view that runs Stockfish on Android, where the app's
// own JavaScript engine (Hermes) has no WebAssembly. It's an Expo DOM
// component, like the board, so it runs in its own web view; the engine runs
// in a Web Worker inside it, off every thread the app draws with.
import type { DOMImperativeFactory, DOMProps } from 'expo/dom';
import { useDOMImperativeHandle } from 'expo/dom';
import { type Ref, useEffect, useRef } from 'react';

import type { DownloadFailure } from '@/resources/download';

import { loadFullStockfish, OtherBuildError } from './full';
import { startStockfishWorker, type StockfishWorker } from './worker';

export interface EngineViewRef {
  /**
   * Starts the engine from its loader's source and its WebAssembly as
   * base64. The web view's own page can't read the app's files, so the app
   * sends them.
   */
  start(loader: string, wasmBase64: string): void;
  /**
   * Starts full Stockfish, whose files are too big to send: the web view
   * downloads them from `folder` itself, or takes them from its cache
   * (`loadFullStockfish`), telling `onDownload`, then `onStarted`.
   */
  startFull(folder: string): void;
  /** Sends the engine one UCI command. */
  send(command: string): void;
}

interface Props {
  readonly ref: Ref<EngineViewRef>;
  /** Called each time the page (re)loads, for the app to call `start`. */
  readonly onLoad: () => void;
  /** A line the engine printed that the app needs (`forwardNeededLines`). */
  readonly onLine: (line: string) => void;
  /** The engine failed to start or crashed (or its files to download); it answers nothing more. */
  readonly onError: (message: string) => void;
  /**
   * How many bytes of full Stockfish have arrived (`startFull`), at each
   * whole percent; or `newVersion` when the folder serves another build, which
   * only a newer app can start (no `onError` follows, so no restart).
   */
  readonly onDownload?: (received: number, failure?: DownloadFailure) => void;
  /** Full Stockfish has its files and is starting (`startFull`). */
  readonly onStarted?: () => void;
  readonly dom?: DOMProps;
}

export default function EngineView({ ref, onLoad, onLine, onError, onDownload, onStarted }: Props) {
  const worker = useRef<StockfishWorker>(null);
  // Aborts full Stockfish's download when the page goes.
  const download = useRef<AbortController>(null);
  useDOMImperativeHandle(
    // Calls cross from the app as JSON; EngineViewRef says which.
    ref as Ref<DOMImperativeFactory>,
    () => {
      const run = (loader: string, wasm: Blob) => {
        worker.current?.terminate();
        worker.current = startStockfishWorker(loader, wasm, onLine, onError);
      };
      return {
        start(...[loader, wasmBase64]: Parameters<DOMImperativeFactory[string]>) {
          if (typeof loader !== 'string' || typeof wasmBase64 !== 'string') return;
          try {
            run(loader, new Blob([decodeBase64(wasmBase64)], { type: 'application/wasm' }));
          } catch (error) {
            onError(String(error));
          }
        },
        startFull(...[folder]: Parameters<DOMImperativeFactory[string]>) {
          if (typeof folder !== 'string') return;
          download.current?.abort();
          const stop = new AbortController();
          download.current = stop;
          loadFullStockfish(folder, stop.signal, (received) => onDownload?.(received))
            .then(({ loader, wasm }) => {
              if (stop.signal.aborted) return;
              run(loader, wasm);
              onStarted?.();
            })
            .catch((error: unknown) => {
              if (stop.signal.aborted) return;
              if (error instanceof OtherBuildError) onDownload?.(0, 'newVersion');
              else onError(String(error));
            });
        },
        send(...[command]: Parameters<DOMImperativeFactory[string]>) {
          if (typeof command === 'string') worker.current?.send(command);
        },
      };
    },
    [onLine, onError, onDownload, onStarted],
  );
  useEffect(() => {
    onLoad();
    return () => {
      download.current?.abort();
      worker.current?.terminate();
    };
    // Once per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** Bytes from base64, without a callback per byte (the WebAssembly is 1.8 MB). */
function decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
