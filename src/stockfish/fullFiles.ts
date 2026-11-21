// Full Stockfish's files: the `stockfish` package's full single-threaded
// build, whose WebAssembly holds Stockfish 19's large network. Too big to
// ship inside the app or commit, they are copied from the package into
// public/stockfish/ (ignored by git) on every `yarn install` (`yarn stockfish`,
// scripts/copy-stockfish.mjs), which the web export serves beside the app.
// The app downloads them only when the learner first picks full Stockfish
// (full.ts): the web app from its own site, Android from the live site.
// Imports nothing, so the opponent ladder can name the size.

/** The engine's JavaScript loader, in public/stockfish/. */
export const FULL_LOADER = 'stockfish-19-single.js';

/** The engine itself, in public/stockfish/. */
export const FULL_WASM = 'stockfish-19-single.wasm';

/** How many bytes the WebAssembly holds (`fullFiles.test.ts` checks it against the package). */
export const FULL_WASM_BYTES = 99_169_054;

/** Its size in megabytes, as the learner is told before picking it. */
export const FULL_STOCKFISH_MB = Math.round(FULL_WASM_BYTES / 1_000_000);

/**
 * Where Android downloads the files: public/stockfish/ on the live site,
 * which GitHub Pages serves to any origin (CORS). A file's name changes with
 * its Stockfish build, so an app built from another commit finds its own.
 */
export const LIVE_FOLDER = 'https://ntucker.github.io/chess/stockfish/';
