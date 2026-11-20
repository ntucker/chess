<p align="center"><img src="assets/brand/logo.svg" width="128" alt="Opening Night logo: a gold chess knight in a spotlight on a dark stage, framed by red curtains"></p>

# Opening Night

Learn your lines. An app for learning chess openings by playing them, on the web now and on Android later. [GOALS.md](GOALS.md) says what it aims to be.

For now it has one screen: a game against [Maia](https://www.maiachess.com), an engine trained to play like people of a rating rather than to find the best move, or, one step harder than Maia's strongest rating, against Stockfish, which plays its best move. You can play either color, step back and forward through the moves, play a different move from any earlier position, and start over.

## Get started

You need Node.js 22 or later, with Corepack enabled for Yarn 4.

```bash
corepack enable
yarn install
yarn web        # or: yarn android
```

`yarn start` opens the Expo dev server, where you can pick a platform or scan the QR code with [Expo Go](https://expo.dev/go).

| Script | What it does |
| --- | --- |
| `yarn start` | Start the Expo dev server |
| `yarn web` / `yarn android` | Start it and open that platform |
| `yarn typecheck` | Type-check with TypeScript |
| `yarn lint` | Lint with ESLint |
| `yarn format` | Format with Prettier |
| `yarn test` | Run the unit tests (Jest) |
| `yarn vendor:silk [path]` | Rebuild the vendored Silk packages from a Silk checkout (default `../silk`) |
| `yarn brand` | Redraw the logo and every icon made from it (`scripts/make-brand.mjs`) |
| `yarn maia` | Download Maia's models and convert them for the app (see [Maia](#maia)) |
| `yarn stockfish` | Copy Stockfish from the pinned `stockfish` package into `assets/stockfish/` (see [Evaluation bar](#evaluation-bar)) |
| `yarn import-study <name>` | Turn the lichess studies and Wikibooks pages listed in `scripts/import-study/studies.ts` into a lesson file in `assets/lessons/`, with popularity from the lichess explorer, which needs a lichess token in `LICHESS_TOKEN` or a proxy that adds one, and notes rewritten by Claude through a signed-in `claude` CLI (answers committed in `scripts/import-study/answers/`, which `--no-model` reuses without calling it; usage in `scripts/import-study/index.ts`) |

## How it fits together

| Part | Library | Where |
| --- | --- | --- |
| App shell and routing | [Expo](https://docs.expo.dev) SDK 58, Expo Router | `src/app/` |
| Network | [Reactive Data Client](https://dataclient.io) 0.19 | `src/resources/` |
| Design system | [Silk](https://github.com/reactive/silk) (`@reactive/silk-native`) | `src/components/` |
| Board | [chessground](https://github.com/lichess-org/chessground) in an [Expo DOM component](https://docs.expo.dev/guides/dom-components/) | `src/components/Board.tsx` |
| Chess rules | [chessops](https://github.com/niklasf/chessops) | `src/game/` |
| Opponent | [Maia](https://github.com/CSSLab/maia-chess) at a rating from 1100 to 1900 (1500 by default), or Stockfish as the hardest step; the rating in the opponent's name bar ("plays like a 1500") opens a list to pick it from, as does a footnote under the scoresheet ("Play against 1100 · 1500 · 1900 · Stockfish") | `src/opponent/` |
| Evaluation bar, and the opponent when chosen | [Stockfish](https://stockfishchess.org) 19 lite in WebAssembly, run on the device | `src/stockfish/` |

Silk isn't on npm yet, so the app installs it from the tarballs in `vendor/`.

## Maia

Maia is a set of neural networks, one for each rating from 1100 to 1900, trained on lichess games to predict the move a player of that rating would make. For example, the 1100 network opens 1. e4 and answers 1. e4 with 1... e5. The app plays the move its network rates most likely, as Maia does on lichess, without searching ahead.

The networks ship with the app (`assets/maia/`, 1.2 MB each) and run on the device in plain TypeScript (`src/maia/network.ts`), so the app needs no server and works offline. A move takes about 25 ms on a laptop. It is worked out off the main thread (a Web Worker on the web, a background JavaScript runtime on Android), so the app keeps responding meanwhile. `yarn maia` downloads the original models from the [Maia repository](https://github.com/CSSLab/maia-chess) and rewrites them in the app's smaller format (`scripts/convert-maia.mjs` describes it).

Each network can also estimate how often each side wins, draws or loses from a position, learned from the results of games between players of its rating. Only the 1900 network keeps this part (its file is 1.7 MB); the evaluation bar can use it instead of Stockfish (see [Evaluation bar](#evaluation-bar)).

The models are licensed under the GPL-3.0, which is different from the app's own license; see `assets/maia/LICENSE`.

## Evaluation bar

The bar beside the board shows how the position stands: White's share of the bar is White's expected score, and the leading side's end shows its advantage in pawns, or `M3` when it mates in 3. A footnote under the scoresheet ("Evaluation by Stockfish · Maia") picks who judges:

- **Stockfish** (the default): Stockfish 19 lite, a 1.8 MB WebAssembly build with a small network, searching 100,000 positions (about depth 16). On a recent phone that takes about 0.3 s. Pawns turn into an expected score with lichess's curve.
- **Maia**: the 1900 network's estimate of how players of that rating score from here, converted to pawns the way Leela Chess Zero does. It uses less memory, since Stockfish isn't started.

On 240 positions from club-level games, judged against full Stockfish 19 at depth 24, Stockfish lite at depth 12 was off by 3.4 percentage points of expected score on average, and Maia 1900 by 10.4. Maia also misses mates: after 1. e4 e5 2. Qh5 d6 3. Nf3 Be6 4. Nc3 Nf6 5. Qh4 Be7 6. Ng5 O-O 7. Bd3 Bd7 8. Nd5 Nxd5, White mates with Qxh7, and Maia gives White 59%.

Stockfish runs in a Web Worker. On the web that's in the page; on Android, whose JavaScript engine (Hermes) has no WebAssembly, it's inside a hidden web view (`src/stockfish/EngineView.tsx`, an Expo DOM component). Either way it searches off every thread that draws the app. It is licensed under the GPL-3.0 and ships unmodified as separate files that the app only talks to with UCI text commands; see `assets/stockfish/LICENSE` and the source at https://github.com/nmrugg/stockfish.js and https://github.com/official-stockfish/Stockfish.

## Web deploys

Every push to `main` publishes the web app to GitHub Pages, at https://ntucker.github.io/chess/ (`.github/workflows/web.yml`). Every pull request from this repository also gets a preview at `https://ntucker.github.io/chess/pr-preview/pr-<number>/`, linked in a comment on the pull request. Previews skip minifying to build faster, keep their own settings and lesson progress, and are removed when the pull request closes. Fork and Dependabot pull requests only build.

The workflow writes both into the `gh-pages` branch, which holds a single commit. A publish from `main` also keeps the hashed files of the site's last 10 builds (`scripts/replace-site.mjs`), so a page opened before a deploy still finds the files it loads late, such as Maia's worker or a lesson. A page older than that says a new version is out and offers a reload. The one-time setup is to set **Source** to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`, in the repository's **Settings → Pages**. Do it after the workflow has published `main` once, or the site is empty until it does.

To try the Pages build locally, export it the way the workflow does and serve `dist/` at `/chess/`:

```bash
PAGES_BASE_PATH=/chess yarn expo export --platform web
```
