import { forwardNeededLines } from './uci';

/** Stockfish running in a Web Worker. */
export interface StockfishWorker {
  /** Sends the engine one UCI command. */
  send(command: string): void;
  /** Stops the engine and frees its files. */
  terminate(): void;
}

/** The files a Web Worker starts the engine from (`startStockfishWorker`). */
export interface EngineFiles {
  readonly loader: string;
  readonly wasm: Blob;
}

/**
 * Starts Stockfish in a Web Worker. `loader` is the source of the engine's
 * JavaScript loader, and `wasm` its WebAssembly; the loader reads the
 * WebAssembly's Blob address from its own address's hash. Running
 * the loader from a Blob means it works whatever MIME type the loader file
 * was served with. `onLine` gets only the lines the app needs from the
 * engine (see `forwardNeededLines`), and `onError` gets the message if the
 * worker fails to start or crashes (it's then already stopped).
 *
 * Runs on the web and inside the hidden web view on Android
 * (EngineView), so it may only use the DOM.
 */
export function startStockfishWorker(
  loader: string,
  wasm: Blob,
  onLine: (line: string) => void,
  onError: (message: string) => void,
): StockfishWorker {
  const script = URL.createObjectURL(new Blob([loader], { type: 'text/javascript' }));
  const wasmUrl = URL.createObjectURL(wasm);
  const worker = new Worker(`${script}#${encodeURIComponent(wasmUrl)}`);
  // Blob addresses keep their bytes alive until they're revoked. The engine
  // has read both files by the time it prints anything, so its first line
  // frees them.
  const freeFiles = () => {
    URL.revokeObjectURL(script);
    URL.revokeObjectURL(wasmUrl);
  };
  const forward = forwardNeededLines(onLine);
  worker.onmessage = ({ data }: MessageEvent<unknown>) => {
    freeFiles();
    if (typeof data === 'string') forward(data);
  };
  const terminate = () => {
    worker.terminate();
    freeFiles();
  };
  // A worker that fails to start or crashes answers nothing more: stop it
  // and free its files before reporting it.
  worker.onerror = (event) => {
    terminate();
    onError(event.message || 'Stockfish stopped');
  };
  return { send: (command) => worker.postMessage(command), terminate };
}
