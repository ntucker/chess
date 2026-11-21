// The engine the app ships, run in Node: for tests and the lesson importer's
// engine check (scripts/import-study). Metro bundles only what the app
// imports, so this never ships.

/** The `stockfish` package's Node build of the engine the app ships. */
export interface NodeEngine {
  listener?: (line: string) => void;
  processCommand(command: string): void;
  terminate?(): void;
}

/**
 * Starts the Node build of the same single-threaded WebAssembly the app runs:
 * lite, or with `full`, full Stockfish (the `stockfish-full` opponent).
 */
export async function startNodeEngine({ full = false } = {}): Promise<NodeEngine> {
  const path = require.resolve(
    full ? 'stockfish/bin/stockfish-19-single.js' : 'stockfish/bin/stockfish-19-lite-single.js',
  );
  // The build starts once per load: a second start from the cached module fails.
  delete require.cache[path];
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS build with no types
  const start = require(path) as () => NodeEngine;
  // Starting the engine sets the global fetch to null; callers still need it.
  const { fetch } = globalThis;
  const engine = await start();
  globalThis.fetch = fetch;
  return engine;
}

/**
 * Connects `engine` with `Stockfish.attach`'s `send`. The engine can't take a
 * command from inside its own output callback, so each one waits a tick, as
 * messages to a Web Worker do.
 */
export const sendTo = (engine: NodeEngine) => (command: string) =>
  setTimeout(() => engine.processCommand(command));
