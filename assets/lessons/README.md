Lesson files (format: `src/lesson/lesson.ts`), registered in `src/resources/lesson.ts`.

- Every lesson file is written by `yarn import-study <id>` (`scripts/import-study/`), which also writes `index.json`: what the start position lists before a lesson loads, the lines that pick each lesson, and their line ends for the passed mark. Rerun the importer rather than editing them; `yarn index-lessons` rewrites `index.json` alone from the lesson files.
- A trap is a move in the guide tree with a `mistake` marker (format 4). Its line is the tree from that move on (`mistakeLine` in `src/lesson/mistakes.ts`), cut at the marker's `plies` where the guide goes on past it, and a note about it names the move with a `{ "type": "mistake", "move": <uci> }` idea. The learner's punishing replies are book moves; the side that falls in plays ordinary ones.

Tests use a small hand-made lesson instead, `src/lesson/fixtures/caro-kann-sample.json`, which the app doesn't ship.

A lesson's `sources` credit what it was made from, with a `license` where one applies. A lesson whose sources include [Wikibooks' Chess Opening Theory](https://en.wikibooks.org/wiki/Chess_Opening_Theory) adapts text that is [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), so it is shared under CC BY-SA 4.0 too.
