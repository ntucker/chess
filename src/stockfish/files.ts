// Stockfish's files, copied from the `stockfish` npm package by `yarn
// stockfish` (scripts/copy-stockfish.mjs). They ship as assets beside the
// app's code, not inside it.
/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles an asset for each static require. */

/** The engine's JavaScript loader, kept as text so Metro doesn't bundle it. */
export const LOADER: number = require('@/assets/stockfish/stockfish-19-lite-single.js.txt');

/** The engine itself, Stockfish 19 lite built for WebAssembly. */
export const WASM: number = require('@/assets/stockfish/stockfish-19-lite-single.wasm');
