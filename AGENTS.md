This is Opening Night, an Expo app (iOS, Android and web) for learning chess openings by playing them. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Project

- `src/app/` Expo Router screens; `src/app/api/` server routes for the web build (the Maia proxy).
- `src/game/` chess rules and game state, built on `chessops`. Pure functions: no React Native imports.
- `src/components/Board.tsx` the board: `@lichess-org/chessground` in an Expo DOM component (`'use dom'`), so it runs in a web view on native. Its props must be JSON; function props become async messages.
- `src/resources/` API endpoints. The engine is Maia (maiachess.com), reached through `getMaiaMove`.
- UI is built from `@reactive/silk-native` (Silk's React Native renderer), themed in `src/theme/theme.ts`: a theater look, with velvet plum and spotlight gold in dark mode and ivory paper with curtain red in light mode, DM Serif Display for headlines, Instrument Sans for text and DM Mono for notation. Use Silk's components and recipe props first; custom pieces read colors from `useTheme()` rather than hard-coding them (the board's CSS in `Board.css` is the exception, since it runs in a web view). Check new theme colors with Silk's `checkThemeContrast`. Silk isn't on npm yet: it installs from `vendor/*.tgz`, rebuilt with `yarn vendor:silk` from a Silk checkout.
- The web build is server-rendered (`web.output: "server"`), so nothing may read the window size or color scheme during the first render. Use `src/theme/useColorScheme.ts`, and lay out with flexbox rather than `useWindowDimensions`.

This app manages server state (fetching, caching, mutations and real-time updates) with Reactive Data Client. Use it for all server data, and read the matching `data-client-*` skill before writing, changing or debugging code that loads or changes data. After adding, removing or upgrading `@data-client/*` packages, run `yarn data-client-skills` and commit the skill links.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

The package manager is Yarn 4. Yarn holds back package versions published less than a day ago (`npmMinimalAgeGate`), so a brand-new release may not install until the next day.

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
yarn lint                   # lint
yarn typecheck              # typecheck
yarn test                   # unit tests (Jest, jest-expo preset)
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint, typecheck and tests before declaring any task done. Game logic in `src/game/` is pure and tested next to it (`*.test.ts`); import `describe`, `it` and `expect` from `@jest/globals`, since TypeScript 6 doesn't load global test types.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `npx eas-cli@latest <command>`; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
