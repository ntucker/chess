// Copies the Stockfish engine the evaluation bar runs into assets/stockfish:
//
//   yarn stockfish
//
// The engine is Stockfish 19 "lite" (a small network), single-threaded, built
// for WebAssembly by the `stockfish` npm package (https://github.com/nmrugg/stockfish.js),
// pinned in devDependencies. Both platforms run it in a Web Worker: on the web
// directly, on Android inside a hidden web view (src/stockfish).
//
// Stockfish is GPL-3.0 licensed. The app ships it unmodified, as separate
// files it talks to only through UCI text commands, with its license next to
// it. The loader is copied with a .txt extension so that Metro ships it as an
// asset instead of bundling it into the app's own JavaScript.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('stockfish/package.json'));
const outDir = fileURLToPath(new URL('../assets/stockfish/', import.meta.url));
mkdirSync(outDir, { recursive: true });
const files = {
  'bin/stockfish-19-lite-single.js': 'stockfish-19-lite-single.js.txt',
  'bin/stockfish-19-lite-single.wasm': 'stockfish-19-lite-single.wasm',
  'Copying.txt': 'LICENSE',
};
for (const [from, to] of Object.entries(files)) copyFileSync(join(pkg, from), join(outDir, to));
console.log(`Copied Stockfish from ${pkg} to ${outDir}`);
