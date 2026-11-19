Lesson files (format: `src/lesson/lesson.ts`), registered in `src/resources/lesson.ts`.

- `caro-kann.json` and `slav.json` are written by `yarn import-study <id>` (`scripts/import-study/`), which also writes their entries in `index.json`: what the start position lists before a lesson loads. Rerun the importer rather than editing them.

Tests use a small hand-made lesson instead, `src/lesson/fixtures/caro-kann-sample.json`, which the app doesn't ship.
