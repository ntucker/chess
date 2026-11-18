/** Stockfish running in a Web Worker. */
export interface StockfishWorker {
  /** Sends the engine one UCI command. */
  send(command: string): void;
  /** Stops the engine and frees its files. */
  terminate(): void;
}

/**
 * Starts Stockfish in a Web Worker. `loader` is the source of the engine's
 * JavaScript loader, and `wasm` its WebAssembly, as an address or as the
 * bytes; the loader reads the address from its own address's hash. Running
 * the loader from a Blob means it works whatever MIME type the loader file
 * was served with. `onLine` gets each line the engine prints, and `onError`
 * the message if the worker fails to start or crashes.
 *
 * Runs on the web and inside the hidden web view on Android
 * (EngineView), so it may only use the DOM.
 */
export function startStockfishWorker(
  loader: string,
  wasm: string | Blob,
  onLine: (line: string) => void,
  onError: (message: string) => void,
): StockfishWorker {
  const script = URL.createObjectURL(new Blob([loader], { type: 'text/javascript' }));
  const ownsWasm = typeof wasm !== 'string';
  const wasmUrl = typeof wasm === 'string' ? wasm : URL.createObjectURL(wasm);
  const worker = new Worker(`${script}#${encodeURIComponent(wasmUrl)}`);
  worker.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (typeof data === 'string') onLine(data);
  };
  worker.onerror = (event) => onError(event.message || 'Stockfish stopped');
  return {
    send: (command) => worker.postMessage(command),
    terminate() {
      worker.terminate();
      // Blob addresses keep their bytes alive until they're revoked.
      URL.revokeObjectURL(script);
      if (ownsWasm) URL.revokeObjectURL(wasmUrl);
    },
  };
}
