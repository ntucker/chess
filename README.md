<p align="center"><img src="assets/brand/logo.svg" width="128" alt="Opening Night logo: a red theater curtain parted in the shape of a chess knight, with stage light coming through"></p>

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
| `yarn vendor:silk [path]` | Rebuild the vendored Silk packages from a Silk checkout (default `../silk`) |
| `yarn brand` | Redraw the logo and every icon made from it (see [Logo](#logo)) |

## How it fits together

| Part | Library | Where |
| --- | --- | --- |
| App shell and routing | [Expo](https://docs.expo.dev) SDK 58, Expo Router | `src/app/` |
| Network | [Reactive Data Client](https://dataclient.io) 0.19 | `src/resources/` |
| Design system | [Silk](https://github.com/reactive/silk) (`@reactive/silk-native`) | `src/components/` |
| Board | [chessground](https://github.com/lichess-org/chessground) in an [Expo DOM component](https://docs.expo.dev/guides/dom-components/) | `src/components/Board.tsx` |
| Chess rules | [chessops](https://github.com/niklasf/chessops) | `src/game/` |
| Engine | [Maia](https://www.maiachess.com) | `src/resources/maia.ts` |

Maia's API doesn't allow calls from other websites, so the web build asks this app's own server route (`src/app/api/maia/`), which forwards the request. The iOS and Android apps call Maia directly.

Silk isn't on npm yet, so the app installs it from the tarballs in `vendor/`.

## Logo

The logo is a theater curtain parted in the shape of a chess knight, with the stage light coming through. `scripts/make-brand.mjs` draws it: the knight is a list of points at the top of that file, and the curtain's folds are computed from the knight, so they gather wherever it pushes them aside.

`yarn brand` writes the logo (`assets/brand/logo.svg`), the knight on its own (`assets/brand/knight.svg`), and the app icon, Android icon layers, splash image, favicon and header mark in `assets/images/`. The images are rendered with [Playwright](https://playwright.dev)'s Chromium, which isn't one of the app's dependencies; without it the script writes the two SVGs and stops.
