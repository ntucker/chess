# Post-game review

A Review page that judges a game move by move, like chess.com's Game Review, and has the learner
replay each mistake before it shows the answer. Full design (rules, layouts, timings), revised after
an adversarial review: [design doc](https://claude.ai/artifact/NuWRdeFy8bWp91bsu1JAew); screens:
[mockups](https://claude.ai/artifact/TauxeQqXhXMLezLf8DF2og). Each piece copies the rules it builds
(thresholds, timings) into its section here, so the plan doesn't depend on those links.

## Decisions (Nathaniel, 2026-11-21)

- One Stockfish lite engine at the app's search (`APP_SEARCH`), measured on real devices first.
  Several engines at once stays a later option.
- Review is offered when the game ends, in every mode; before the end only in a lesson's Practice
  mode, once the game has a move off the guide. Elsewhere the scoresheet's Review button is disabled.
  A game ends only by checkmate or a draw: no Resign button.
- The review adds Brilliant, Great and Miss, which only refine today's labels; `judgeMove` and live
  labels don't change.
- The graph uses softer fills than the evaluation bar (White's area `oklch(0.87 0.03 85)`, Black's
  `oklch(0.31 0.04 305)`). On a touch screen it is a scrubber: dragging moves only a line and a
  bubble, on the UI thread; lifting the finger selects that move.

## Shape

- `/review?moves=…&side=…&lesson=…`, pushed on top of the game; Back returns to it. Built on `Stage`
  on a wide page; on a narrow one, its own column of the same parts.
- It opens on "The reviews are coming in…" with the graph and a count; "First moment" lights up as
  soon as one is confirmed; the verdict and accuracies arrive when the game is checked.
- Nothing stored but the page's reducer (move shown, pointed-at row, tries and answers shown per
  moment, moments visited, failed positions); labels, moments, tally, accuracy and search order are
  pure functions of those, the moves and the analyses in the store, in `src/review/`. `useReview.ts`
  is its only React.
- Retry first: on the learner's mistake the best move stays hidden until they retry or press Show
  best. Three fixed actions (Retry, Show best, Next moment), disabled when they do nothing.
- Explanations live in tooltips, icons over text.

## Pieces

### Piece 1: Review rules

`src/review/`: each move's label, moments, tally, lichess's accuracy formula, and which position to
search next. Tests; no screen.

- Labels: a book move is never searched; a forced move is Best, as the game labels it; a move whose
  needed position failed to search has no label. For a lesson game the base label is the game's.
- Moments: the learner's mistakes and blunders, and the first move of theirs off the guide where
  the guide had a move. Next moment is the earliest one not yet visited.
- Accuracy: a move scores 103.1668 e^(-0.04354 × win points lost) - 3.1669, plus 1, within 0 to
  100; a side's number is the average of its moves' swing-weighted mean and their harmonic mean
  (each move floored at 1 there, as lichess does). A move's weight is the standard deviation of the
  win percent over a window of positions ending after it, as many as a tenth of the game's moves
  (2 to 8), within 0.5 to 12. Book, forced and failed moves are left out; under 8 counted moves
  there is no number ("A brief appearance."). It shows once every searched position is final or failed.
- Search order: the move the board has rested on about a second, if unjudged; a full search already
  running; a sketch (first whole depth of at least 12) of every position in game order; full
  searches for the learner's biggest sketch drops, largest first, each needing the positions before
  and after the move and before the opponent's previous move (Miss); then the rest. A position only
  book moves touch is never searched in full; a failed one is skipped.

### Piece 2: Review page, wide

The route and its address, the page on a wide window, the search order wired to the store
(`useNeedsStockfish`, nothing while another screen is in front; the engine manager reports a search
it gave up on, and its move shows "Try again"), `useMoveQualities` and `reviewMoves` sharing one
labelling rule, the "coming in" headline, the scoresheet's Review button and dashed ring for an
unjudged move, the move card with Stockfish's rows as score changes for the learner, the three
actions, `Tip` opening on focus with a spoken label, the gallery page.

### Piece 3: Phone layout

The review's own narrow column: one name bar, the board, a row with two step buttons around the
graph's place, the panel, the fixed action bar; the scoresheet drawer from the header. Fits 360 by
640. Phone times measured first. Nathaniel sees its preview before it lands. Android check: layout.

### Piece 4: Ways in

The lesson's game-over headline with "Review the game", and the Review button by the scoresheet in
each mode, enabled and disabled. Android check: Back button.

### Piece 5: Graph

The evaluation over the game, on a wide page and in the phone's row; moment dots, a band over the
guide's moves, the sketch hatched; the scrubber; stepping by keyboard and screen reader.
react-native-svg and gesture handler. Android check: touch, with gesture navigation on.

### Piece 6: Retry

Retry, Show best, the tries kept for each moment, Practice this line.

### Piece 7: Play on from here

The lesson page and the free-game page start from a given line; the link in the move card.

### Piece 8: New labels

Brilliant, Great and Miss: rules (a static exchange count for Brilliant; Great tuned to about one a
game on the measured games; Miss built on `refutation` in `src/analysis/quality.ts`, so it agrees
with the board's red arrow), badges in `src/theme/moveQuality.ts`, tooltips, contrast checks; they
join the moments.

### Piece 9: Summary

The tally, accuracies in the name bars, the four verdict lines ("Standing ovation." 90+, "Warm
applause." 75-89, "Mixed notices." 60-74, "A rough night." under 60), "A brief appearance.", First
and Next moment.
