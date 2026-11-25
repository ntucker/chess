# Goals

What Opening Night is for. Read this before you design a feature or choose between approaches.

## The easiest way to understand and learn new chess openings

- Show > tell. Telling can supplement showing, if it is worded concisely and cleanly.
- Play > show. The human mind is a prediction engine, so people learn most easily by exploring the
  ideas they are already thinking of, then pruning and correcting them in new directions.
  - Clear cause and effect makes it easy for people to adjust their thinking quickly.

## Turn any lichess opening into an interactive lesson

Load any opening from lichess, such as a study (https://lichess.org/study/8Uztu7Xx) or one found by a
study search (https://lichess.org/study/search?order=hot&q=caro+kann), and turn it into an interactive
lesson, not just a giant book to read.

## Platforms

- Web first: build, test and polish every feature there.
- Android: supported. Every feature works there too. Judge by what a change does to the code Android
  runs, not by which files it touches. Check on Android a change to code that runs differently there:
  native code (modules, config, worklets, Android-only branches), touch handling you write,
  platform-specific layout (flex tricks, a change to `NATIVE_PARTS`), new or changed behavior in the
  native file of a `.web` twin pair (the one without `.web`), the board's web view. Check only what
  that change could affect. A move after which Android runs the same code as before (even a move into
  a new file), text changes, web-only files, and UI built from existing Silk components or
  `useNarrowPart` parts need only the web check.
- No iOS.
