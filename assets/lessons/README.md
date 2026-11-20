Lesson files (format: `src/lesson/lesson.ts`), registered in `src/resources/lesson.ts`.

- `caro-kann.json` and `slav.json` are written by `yarn import-study <id>` (`scripts/import-study/`), which also writes their entries in `index.json`: what the start position lists before a lesson loads, and each first move's line ends for its passed mark. Rerun the importer rather than editing them; `yarn index-lessons` rewrites `index.json` alone from the lesson files.

Tests use a small hand-made lesson instead, `src/lesson/fixtures/caro-kann-sample.json`, which the app doesn't ship.

A lesson's `sources` credit what it was made from, with a `license` where one applies. `caro-kann.json` and `slav.json` adapt text from [Wikibooks' Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory), which is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), so both are shared under CC BY-SA 4.0 too.
