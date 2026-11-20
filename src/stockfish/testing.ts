// Helpers for tests that script or run Stockfish. Metro bundles only what the
// app imports, so this never ships.
import type { Supervisor } from './engine';

/** A supervisor for an engine in a test (`attachStockfish`) that never restarts it. */
export const NO_RESTARTS: Supervisor = { ready() {}, failed() {} };

/** The `stockfish` package's Node build of the engine the app ships. */
export interface NodeEngine {
  listener?: (line: string) => void;
  processCommand(command: string): void;
  terminate?(): void;
}

/** Starts the Node build, the same lite single-threaded WebAssembly the app runs. */
export async function startNodeEngine(): Promise<NodeEngine> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a CommonJS build with no types
  const start = require('stockfish/bin/stockfish-19-lite-single.js') as () => NodeEngine;
  // Starting the engine sets the global fetch to null; callers still need it.
  const { fetch } = globalThis;
  const engine = await start();
  globalThis.fetch = fetch;
  return engine;
}

/**
 * Connects `engine` with `attachStockfish`'s `send`. The engine can't take a
 * command from inside its own output callback, so each one waits a tick, as
 * messages to a Web Worker do.
 */
export const sendTo = (engine: NodeEngine) => (command: string) =>
  setTimeout(() => engine.processCommand(command));
