Lesson files (format: `src/lesson/lesson.ts`), registered in `src/resources/lesson.ts`.

- Every lesson file is written by `yarn import-study <id>` (`scripts/import-study/`), which also writes `index.json`: what the start position lists before a lesson loads, the lines that pick each lesson, and their line ends for the passed mark. Rerun the importer rather than editing them; `yarn index-lessons` rewrites `index.json` alone from the lesson files.

Tests use a small hand-made lesson instead, `src/lesson/fixtures/caro-kann-sample.json`, which the app doesn't ship.

A lesson's `sources` credit what it was made from, with a `license` where one applies. `caro-kann.json`, `slav.json`, `london.json`, `anti-london.json`, `albin.json`, `open-game.json` and `bc4-system.json` adapt text from [Wikibooks' Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory), which is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), so they are shared under CC BY-SA 4.0 too.
