/**
 * Starts Stockfish in a Web Worker and calls `onLine` with each line it
 * prints. `loader` is the source of the engine's JavaScript loader and
 * `wasmUrl` the address of its WebAssembly, which the loader reads from its
 * own address's hash. Running the loader from a Blob means it works whatever
 * MIME type the loader file was served with.
 *
 * Runs on the web and inside the hidden web view on iOS and Android
 * (EngineView), so it may only use the DOM.
 */
export function startStockfishWorker(
  loader: string,
  wasmUrl: string,
  onLine: (line: string) => void,
): Worker {
  const script = URL.createObjectURL(new Blob([loader], { type: 'text/javascript' }));
  const worker = new Worker(`${script}#${encodeURIComponent(wasmUrl)}`);
  worker.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (typeof data === 'string') onLine(data);
  };
  return worker;
}
