// Copies the Stockfish engines the app runs out of the `stockfish` npm package
// (https://github.com/nmrugg/stockfish.js), pinned in devDependencies:
//
//   yarn stockfish   (also run by every `yarn install`)
//
// - Stockfish 19 "lite" (a small network), single-threaded, built for
//   WebAssembly, into assets/stockfish, committed: the evaluation bar, move
//   labels and the `stockfish` opponent. Both platforms run it in a Web
//   Worker: on the web directly, on Android inside a hidden web view
//   (src/stockfish).
// - Full Stockfish 19 (its large network, 99 MB), single-threaded, into
//   public/stockfish, which git ignores and the web export serves as is: the
//   `stockfish-full` opponent, which the web app downloads only when it's
//   first picked (src/stockfish/full.ts).
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
const publicDir = fileURLToPath(new URL('../public/stockfish/', import.meta.url));
mkdirSync(outDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });
// Each file the package has, and where it goes.
const files = {
  'bin/stockfish-19-lite-single.js': [join(outDir, 'stockfish-19-lite-single.js.txt')],
  'bin/stockfish-19-lite-single.wasm': [join(outDir, 'stockfish-19-lite-single.wasm')],
  'Copying.txt': [join(outDir, 'LICENSE'), join(publicDir, 'LICENSE')],
  // The names src/stockfish/fullFiles.ts gives.
  'bin/stockfish-19-single.js': [join(publicDir, 'stockfish-19-single.js')],
  'bin/stockfish-19-single.wasm': [join(publicDir, 'stockfish-19-single.wasm')],
};
for (const [from, to] of Object.entries(files))
  for (const path of to) copyFileSync(join(pkg, from), path);
console.log(`Copied Stockfish from ${pkg} to ${outDir} and ${publicDir}`);
