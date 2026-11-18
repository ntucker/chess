<p align="center"><img src="assets/brand/logo.svg" width="128" alt="Opening Night logo: a gold chess knight in a spotlight on a dark stage, framed by red curtains"></p>

# Opening Night

Learn your lines. An app for learning chess openings by playing them, for iOS, Android and the web.

For now it has one screen: a game against [Maia](https://www.maiachess.com), an engine trained to play like people rather than to find the best move. You can play either color, step back and forward through the moves, play a different move from any earlier position, and start over.

## Get started

You need Node.js 22 or later, with Corepack enabled for Yarn 4.

```bash
corepack enable
yarn install
yarn web        # or: yarn ios, yarn android
```

`yarn start` opens the Expo dev server, where you can pick a platform or scan the QR code with [Expo Go](https://expo.dev/go).

| Script | What it does |
| --- | --- |
| `yarn start` | Start the Expo dev server |
| `yarn web` / `yarn ios` / `yarn android` | Start it and open that platform |
| `yarn typecheck` | Type-check with TypeScript |
| `yarn lint` | Lint with ESLint |
| `yarn test` | Run the unit tests (Jest) |
| `yarn vendor:silk [path]` | Rebuild the vendored Silk packages from a Silk checkout (default `../silk`) |
| `yarn brand` | Redraw the logo and every icon made from it (see [Logo](#logo)) |
| `yarn maia` | Download Maia's models and convert them for the app (see [Maia](#maia)) |

## How it fits together

| Part | Library | Where |
| --- | --- | --- |
| App shell and routing | [Expo](https://docs.expo.dev) SDK 58, Expo Router | `src/app/` |
| Network | [Reactive Data Client](https://dataclient.io) 0.19 | `src/resources/` |
| Design system | [Silk](https://github.com/reactive/silk) (`@reactive/silk-native`) | `src/components/` |
| Board | [chessground](https://github.com/lichess-org/chessground) in an [Expo DOM component](https://docs.expo.dev/guides/dom-components/) | `src/components/Board.tsx` |
| Chess rules | [chessops](https://github.com/niklasf/chessops) | `src/game/` |
| Engine | [Maia](https://github.com/CSSLab/maia-chess), run on the device | `src/maia/` |

Silk isn't on npm yet, so the app installs it from the tarballs in `vendor/`.

## Maia

Maia is a set of neural networks, one for each rating from 1100 to 1900, trained on lichess games to predict the move a player of that rating would make. For example, the 1100 network opens 1. e4 and answers 1. e4 with 1... e5. The app plays the move its network rates most likely, as Maia does on lichess, without searching ahead.

The networks ship with the app (`assets/maia/`, 1.2 MB each) and run on the device in plain TypeScript (`src/maia/network.ts`), so the app needs no server and works offline. A move takes about 25 ms on a laptop. It is worked out off the main thread (a Web Worker on the web, a background JavaScript runtime on iOS and Android), so the app keeps responding meanwhile. `yarn maia` downloads the original models from the [Maia repository](https://github.com/CSSLab/maia-chess) and rewrites them in the app's smaller format (`scripts/convert-maia.mjs` describes it).

The models are licensed under the GPL-3.0, which is different from the app's own license; see `assets/maia/LICENSE`.

## Web deploys

Every push to `main` publishes the web app to GitHub Pages, at https://ntucker.github.io/chess/ (`.github/workflows/web.yml`). The one-time setup is to set **Source** to **GitHub Actions** in the repository's **Settings → Pages**. After that, push to `main` or run the **Web** workflow from the Actions tab.

To try the Pages build locally, export it the way the workflow does and serve `dist/` at `/chess/`:

```bash
PAGES_BASE_PATH=/chess yarn expo export --platform web
```

## Logo

The logo is a gold chess knight standing in a spotlight on a dark stage, framed by two red curtains. `scripts/make-brand.mjs` draws it: the knight is a list of points at the top of that file, and the stage and curtains are the shapes below it.

`yarn brand` writes the logo (`assets/brand/logo.svg`), the knight on its own (`assets/brand/knight.svg`), and the app icon, Android icon layers, splash image, favicon and header mark in `assets/images/`. The images are rendered with [Playwright](https://playwright.dev)'s Chromium, which isn't one of the app's dependencies; without it the script writes the two SVGs and stops.
