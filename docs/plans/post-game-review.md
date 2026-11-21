# Post-game review

A Review page that judges a game move by move, like chess.com's Game Review, and has the learner
replay each mistake before it shows the answer. Full design (rules, layouts, timings):
[design doc](https://claude.ai/artifact/NuWRdeFy8bWp91bsu1JAew); screens:
[mockups](https://claude.ai/artifact/TauxeQqXhXMLezLf8DF2og). Each piece copies the rules it builds
(thresholds, timings) into its section here, so the plan doesn't depend on those links.

## Decisions (Nathaniel, 2026-11-21)

- One Stockfish lite engine at the app's search (`APP_SEARCH`), so a review label is the label the
  game showed (forced moves aside: Piece 1). Several engines at once stays a later option.
- Review is offered when the game ends, in every mode; before the end only in a lesson's Practice
  mode, once the game has a move off the guide. Elsewhere the scoresheet's Review button is disabled.
- The review adds Brilliant, Great and Miss, which only refine today's labels; `judgeMove` and live
  labels don't change.
- The graph uses softer fills than the evaluation bar (White's area `oklch(0.87 0.03 85)`, Black's
  `oklch(0.31 0.04 305)`). On a touch screen it is a scrubber: dragging moves only a line and a
  bubble, on the UI thread; lifting the finger selects that move.

## Shape

- `/review?moves=…&side=…&lesson=…`, pushed on top of the game; Back returns to it. Built on `Stage`.
- Nothing stored but the page's reducer (move shown, a retry in progress, answers shown); labels,
  moments, tally, accuracy and search order are pure functions of the moves and the analyses in the
  store, in `src/review/`. `useReview.ts` is its only React.
- Retry first: on the learner's mistake the best move stays hidden until they retry or press Show
  best.
- The start position is the summary: a verdict line by the learner's accuracy ("Standing ovation."
  90+, "Warm applause." 75-89, "Mixed notices." 60-74, "A rough night." under 60), both accuracies,
  and the tally.
- Explanations live in tooltips, icons over text, controls that do nothing are disabled.

## Pieces

### Piece 1: Review rules

`src/review/`: each move's label (book never searched; forced moves unlabelled, unlike the live
game, which labels them), moments, tally, lichess's accuracy formula, and which position to search
next (board's move, a running full search, sketches in game order, full searches worst drop first,
then the rest). Tests; no screen.

Accuracy rules: a move scores 103.1668 e^(-0.04354 × win points lost) - 3.1669, plus 1, within 0 to
100; a side's number is the average of its moves' swing-weighted mean and their harmonic mean (each
move floored at 1 there). A move's weight is the standard deviation of the win percent over a
window of positions ending after it, as many as a tenth of the game's moves (2 to 8), within 0.5
to 12. A sketch is the first whole depth of at least 12.

### Piece 2: Review page

The route, both entry buttons, headline, scoresheet, move card with Stockfish's rows as score
changes for the learner, `useMoveQualities` and `reviewMoves` sharing one labelling rule, the
search order wired to the store (`useNeedsStockfish`, nothing while another screen is in front; a
position whose search fails is skipped and its moves shown unavailable, so the rest still
finishes), and a tooltip on Silk's Popover. Android check: layout.

### Piece 3: Graph

The evaluation over the game: in the panel on a wide page, under the board on a narrow one; moment
dots, a band over the guide's moves, the sketch drawn hatched; the scrubber. react-native-svg and
gesture handler. Android check: touch.

### Piece 4: Retry

Retry, Show best, Play on from here (a new game from the corrected position), Practice this line.

### Piece 5: New labels

Brilliant, Great and Miss: rules (with a static exchange count for Brilliant), badges in
`src/theme/moveQuality.ts`, tooltips; they join the moments.

### Piece 6: Summary

The tally, accuracies in the name bars, the four verdict lines, Next moment.
