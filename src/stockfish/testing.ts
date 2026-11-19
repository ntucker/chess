// Helpers for tests that script or run Stockfish. Metro bundles only what the
// app imports, so this never ships.
import type { Supervisor } from './engine';

/** A supervisor for an engine in a test (`attachStockfish`) that never restarts it. */
export const NO_RESTARTS: Supervisor = { ready() {}, failed() {} };
