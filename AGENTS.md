This is Opening Night, an Expo app for learning chess openings by playing them. Read `GOALS.md` before you design a feature or choose between approaches: it says what the app is for and which platforms it targets.

## Project

- `src/app/` Expo Router screens: every file there is a route and `_layout.tsx` files define navigators, so components, hooks and helpers live outside it.
- The web app is a static export (`web.output: "static"`), deployed to GitHub Pages by `.github/workflows/web.yml`; `app.config.ts` sets the `/chess` base path when `PAGES_BASE_PATH` is set. Pull requests run the export without deploying. There is no server: don't add API routes.
- The web build pre-renders HTML, so nothing may read the window size or color scheme during the first render. Use `src/theme/useColorScheme.ts`, and lay out with flexbox rather than `useWindowDimensions`.
- `src/game/` chess rules and game state, built on `chessops`. `game.ts` (the reducer) and `replay.ts` (the rules) are pure functions with no React or React Native imports; `useGame.ts` connects them to React and to the opponent's engine.
- `src/analysis/quality.ts` labels each move (best, good, inaccuracy, mistake, blunder; `book` is reserved for lesson data) by the expected score it gives away, with the thresholds and their sources in one place. `useGame.ts` judges every move played with `getEvaluation` and keeps the labels in game state. How a label looks is `src/theme/moveQuality.ts`, which imports nothing so the board's web view can use it too.
- `src/components/Board.tsx` the board: `@lichess-org/chessground` in an Expo DOM component (`'use dom'`), so it runs in a web view on native. Its props must be JSON; function props become async messages.
- `src/maia/` the Maia engine, run on the device:
  - lc0's input encoding and move names are in `maia.ts` and `policy.ts`, the network itself in `network.ts`. The networks are assets (`assets/maia/*.bin`, written by `yarn maia`; Metro bundles `.bin` files because of `metro.config.js`), listed in `models.ts`.
  - `engine.ts` plays a move: the rules run on the calling thread, and the network runs off it through `runNetwork.ts` (a react-native-worklets background runtime on native) or `runNetwork.web.ts` (`maia.worker.ts`, a Web Worker).
  - `network.ts` is a worklet file: it may not import anything, and each function must come before the functions that call it (`yarn lint` enforces both).
  - Maia writes castling as the king taking its rook (`e1h1`). The game records every move through `lineMove` in `src/game/replay.ts`, which writes castling as the king's two-square move (`e1g1`).
  - `maia.test.ts` checks the engine against `reference-moves.json`, the moves a separate reference implementation of the network picks in 162 positions for each of the 1100 and 1900 networks and, for the 1900 network, the win, draw and loss chances it gives them, so a failure there means the engine broke, not that the expected move needs updating. The one exception is a position where the two best moves score almost the same, after a change to `scripts/convert-maia.mjs`: the app's weights are 16-bit copies of the originals and can tip a near tie.
  - `scripts/maia-reference.py` writes `reference-moves.json` from lc0's original `.pb.gz` weights, not the app's `.bin` files (setup and usage in its docstring; Python only, never bundled). Rerun it only after changing the models or adding positions or ratings, and review each move that changes.
- `src/stockfish/` Stockfish, which judges positions for the evaluation bar (Maia can instead; the choice is `src/evaluation/useEvaluationEngine.ts`) and can play the opponent:
  - The engine is the `stockfish` npm package's lite single-threaded WebAssembly build, copied into `assets/stockfish/` by `yarn stockfish` (its loader as `.txt`, so Metro ships it as an asset rather than bundling it). It's GPL-3.0: keep it unmodified and separate, talking to it only with UCI text, and never compile or bundle it into the app's own code.
  - It always runs in a Web Worker (`worker.ts`): `StockfishHost.web.tsx` starts one in the page; `StockfishHost.tsx` runs one inside a hidden Expo DOM component (`EngineView.tsx`), since Hermes has no WebAssembly. The root layout mounts the host only while the evaluation bar or the opponent uses Stockfish.
  - `engine.ts` runs one search at a time and answers every request: the running search finishes, then the newest waiting request runs (move labels need every position of the game, not only the one on the board). A host attaches each engine it starts with `attachStockfish` and detaches it when it stops or crashes; requests wait for the next engine, which takes over the old one's unfinished search. A failure is cached for Data Client's default error expiry (`errorExpiryLength`, 1 s) and leaves the bar empty until the position changes. `uci.ts` holds the protocol and the score conversion. `engine.test.ts` runs the real engine in Node; `engine.lifecycle.test.ts` scripts engines to test attaching, takeover and stopping.
- `src/opponent/` who the learner plays against: Maia by default or Stockfish (`useOpponent`), at one rating that picks Maia's network; Stockfish plays its best move at any rating. Screens read `useOpponent()` rather than naming an engine.
- `src/settings/setting.ts` remembered settings (`createSetting`), in `localStorage`; every setting is one of these.
- `src/resources/` Reactive Data Client endpoints. Async data goes through Data Client, even with no server: `getMaiaMove` wraps the on-device engine; `fetchOpponentMove` (`opponent.ts`) plays the opponent's move with Maia, or takes Stockfish's from `getEvaluation` so a position is searched once; `gameOpponent` wraps it as the opponent `useGame` takes; `getEvaluation` judges a position with the chosen engine, or by its result once the game is over. Read the matching `data-client-*` skill before writing, changing or debugging code that loads or changes data. After adding, removing or upgrading `@data-client/*` packages, run `yarn data-client-skills` and commit the skill links in `.agents/skills`.
- UI is built from `@reactive/silk-native` (Silk's React Native renderer), themed in `src/theme/theme.ts`: a theater look, with velvet plum and spotlight gold in dark mode and ivory paper with curtain red in light mode, DM Serif Display for headlines, Instrument Sans for text and DM Mono for notation. Use Silk's components and recipe props first; custom pieces read colors from `useTheme()` rather than hard-coding them (the board's CSS in `Board.css` is the exception, since it runs in a web view). Check new theme colors with Silk's `checkThemeContrast`. Silk isn't on npm yet: it installs from `vendor/*.tgz`, rebuilt with `yarn vendor:silk` from a Silk checkout.
- The logo and every icon in `assets/images/` are drawn by `scripts/make-brand.mjs` (`yarn brand`). Change the script and run it again rather than editing the images.

## Expo has changed: check the docs, not your memory

Expo ships breaking changes every SDK release, so APIs you remember may be renamed, moved or removed. Before writing code that touches an Expo, EAS or React Native API, read the major version of `expo` in `package.json` and fetch the matching docs (`https://docs.expo.dev/versions/v<major>.0.0/`, or https://docs.expo.dev/llms.txt for an index of every page). If the docs can't be reached from your environment, read the installed package's types and README in `node_modules` instead.

## Commands

The package manager is Yarn 4, through Corepack. Yarn holds back package versions published less than a day ago (`npmMinimalAgeGate`), so a brand-new release may not install until the next day.

```bash
npx expo install <package>  # add packages with this, not yarn add: it picks versions that match the Expo SDK
npx expo start              # start the dev server
yarn lint                   # lint
yarn typecheck              # typecheck
yarn test                   # unit tests (Jest, jest-expo preset)
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

If `npx expo install` can't reach Expo's servers, run it with `EXPO_OFFLINE=1`, which takes versions from the list bundled with the installed `expo` package.

Run lint, typecheck and tests before declaring any task done. Tests sit next to the code they cover (`*.test.ts`); import `describe`, `it` and `expect` from `@jest/globals`, since TypeScript 6 doesn't load global test types.

## Native builds

- Platforms: see `GOALS.md`. No iOS-only code or config. Don't test features on Android, but avoid libraries without Android support.
- `android/` (and `ios/`) are generated (Continuous Native Generation) and ignored by git. Configure native behavior in `app.json`, `app.config.ts` and config plugins rather than creating or editing those directories.
- Expo Go only includes its bundled native modules. Once a library with native code is added, running the app on Android needs a development build: `npx expo run:android` locally, or an EAS build.
- EAS isn't set up yet (there is no `eas.json`). When it is needed, run its CLI as `npx eas-cli@latest <command>` rather than a bare `eas`.
- Prefer Expo's own modules over third-party libraries, and check your available skills before adding a dependency.

## Keeping this file useful

When you work out a non-obvious procedure or trap during a task (a command that fails in some environment, a test that must be read a certain way), write it down briefly in that same task, where its topic lives: the script's header comment, the skill that owns it, or this file.
