# Opportunities

An opportunity is a position where a real opponent is likely to play a bad move, and the way to
punish it is not obvious. Opening Night finds them from lichess game counts and Stockfish, and
teaches each one in three acts by letting the learner play it. Example, from the Stafford Gambit at
the 1400 band: 36% of White players reach 5.d3 Bc5 (Act I, the setup); 15% of them then play 6.Bg5,
which gives away 43% of White's winning chances, and Black answers 6...Nxe4 (Act II, "Your cue.");
7.Bxd8 Bxf2+ 8.Ke2 Bg4# follows (Act III, the payoff).

Product plan with mockups: [product plan](https://claude.ai/artifact/Bun3eWNJZdbhDW2iAv9vAZ).
Technical plan and its adversarial review: [technical
plan](https://claude.ai/artifact/W7ri91SoRGYDqHcowjnz33). This file restates both as they are to be
built; where they differ, this file wins. Each piece's section holds the rules it builds, so the
plan doesn't depend on those links.

## Decisions (Nathaniel, 2026-11-22 to 2026-11-24)

- Real lichess counts per rating band are the source of "how often". Maia is only the fallback: in
  the app when no lichess account is connected, or where lichess has too few games (as its own run,
  labeled estimates; see Shape).
- Every move the learner plays on the way to an opportunity must still be a good move (`labelMove`
  in `src/analysis/quality.ts`, where a book move counts as book).
- One entry per position, however it is reached.
- Everything has an inverse: data is stored by side (White, Black), never by role (learner,
  opponent). The same record is a trap read by the side that errs and an opportunity read by the
  other side. Which directions the app teaches is a separate product choice: it does not train
  learners to avoid their own likely mistakes.
- Traps and opportunities are one shape. "Show traps" stays a pure display setting: it only filters
  in `src/lesson/guidance.ts` and never shapes, drops or gates loaded data. Off, it hides only the
  traps the learner's side can fall into, so opportunities stay shown.
- An opportunity is ranked by what knowing it is worth, not by how bad the mistake is: score = games
  reaching the cue × gain if known (Rules; piece B's gate replaced reach × share × gain, below).
  This replaces the product plan's "how often × how bad × reach", agreed by Nathaniel 2026-11-24
  after the Stafford report ranked recaptures everyone finds (6.Bxd5 Qxd5, played by 100%) above
  finds whose natural reply is the wrong one (5.Nxf7, where 76% recapture and 8% find 5...Qe7). A
  find is kept only where Act III leaves the learner clearly better.
- The finder opens at any position (in a lesson, past a guide, in free play) and finds can be saved
  on the device. Publishing finds to other users is later and not in this plan.
- In the app, "how often" comes from the learner's connected lichess account, else (no account, or
  too few games) Maia on the device, as its own run. Each number says which source it came from.
- In Practice, an opportunity common enough to count (see "Line to pass" in Rules) is a line to
  pass, and the opponent steers into it until it is passed. Inside one, the opponent also plays
  every reply played 10% or more. A dice mode (real rates) and guides extended to every common reply
  are future ideas, not started.
- Names: "Opportunities" for the list, "Your cue." for the moment.
- Phones are first-class. The phone screens build on the phone redesign's two panes and pager.
- Saved progress is not migrated: new lines can reopen rows a learner already passed. Release notes
  say so.
- Piece B's gate (2026-11-24, #210). Nathaniel left it to the build thread's judgement with a Fable
  adversarial review ("Use your judgement and have an adversarial review on it from fable for more
  input"), and the planning thread agreed to all of it:
  - Only finds on the guide (Rules) are ranked, kept and written into lessons. The others are
    reported apart, as evidence.
  - Reach adds up every order of fewest moves into a position, and score = games reaching the cue ×
    gain if known. In the Stafford, 5.d3 Bc5 6.Nc3 and 5.Nc3 Bc5 6.d3 reach the same cue, and its
    score counts the games of both.
  - A mistake whose gain is under `minGain` (0.01) is no find, and the walk goes on past it. At 0
    gain sat only the recaptures nearly everyone finds.
  - Act III is not obviously won while the punishing side is behind in material.
  - Where the guide's move at a cue isn't an accepted reply, the report lists it.
  - Limits: `keepScore` 0.6, `minGain` 0.01, `reachFloor` 0.005 (at 0.01 the Stafford walk missed
    8.Ke1 Qh4+ and 7.g3 Nxg3, both on its guide), `maxPlies` 24, `payoffMoves` 6, `winScore` 0.8,
    `materialUp` 3, `estimateCoverage` 0.5, the share floor `RARE_SHARE` (5%) and `MIN_GAMES` 100.

## Shape

- One home for each fact. Nothing derivable is stored, and every PR lists each new stored field or
  app state and why it can't be derived; a field that can be computed from those below fails review.

  | Fact                                     | Its one home                                           |
  | ---------------------------------------- | ------------------------------------------------------ |
  | The moves of a line                      | The guide tree (`LessonPosition.moves`), as today      |
  | Games per move, per band                 | `LessonMove.games`, as today                           |
  | Games reaching a position, per band      | New: `LessonPosition.games`                            |
  | This move is the mistake                 | New: `LessonMove.mistake`, a marker on the erring move |
  | How much the mistake gives away (import) | `cost` on that marker: gates the find, and is shown   |
  | What knowing the cue is worth, per band  | `gain` on that marker, written at import; ranks only   |
  | The mistake's title in the list          | `name` on that marker, written by the explain step     |
  | The guide's verdict on a migrated trap   | `verdict` on that marker (today `Trap.verdict`)        |

- A move's lichess share has one definition: its games over the position's explorer total where
  `LessonPosition.games` exists, else over the sum of the listed moves' games (older data). One
  function computes it, in its own module `src/lesson/share.ts` (where `gamesPlayed` moves, so
  `select.ts` and `cleanRun.ts`, which already imports `select.ts`, can both import it without a
  cycle). It works on game counts: a move's games, the listed moves' games and the position's total,
  or undefined for older data, so callers holding raw explorer counts use it too; a helper beside it
  reads a `LessonMove`'s games in one band or `'all'` (summed over every band). A move without
  counts has no share (undefined), and each caller keeps today's handling of that: `candidates`
  shows none, `countedReplies` counts the move (but see its marked-move exception in Rules), and
  `moveShares` uses its small floor. Its callers: `candidates` in `src/lesson/select.ts` (one band,
  which its rare-row rule `rareLast` reads), `countedReplies` (all bands), `moveShares` in
  `src/lesson/openings.ts` (all bands; with `bookOnly` it then renormalizes the function's values
  over the book moves to sum to one, not a second ratio, since the learner plays the book however
  rarely games do, which gives today's ratio over the book moves; where no move has counts it keeps
  today's 1 for each, so which variation line wins doesn't change before any total exists),
  `opponentModel` in `scripts/import-study/coverOpponent.ts` (its common-move filter, on the
  explorer's counts) and piece A's `repliesFrom` (the lichess host's conversion, which computes the
  same ratio until then). Piece C adds it and moves the callers onto it. The function alone alters
  no lesson until D1 or D3 writes its totals; then that lesson's shares get smaller, since unlisted
  moves join the denominator, and its rare rows and counted replies can shift slightly. A Maia share
  is a separate source for the same field: a softmax over the legal moves' policy scores (piece J).
- Derived, one pure function each in `src/opportunity/`: reach (`reachOf`: the erring side's shares
  multiplied along each order of fewest moves into a position, summed over those orders; Rules), the
  cue's accepted replies (`acceptedReplies`, Rules), found rate (the sum of their shares at the
  cue), gain if known (`gainIfKnown`, `src/opportunity/gain.ts`, which the importer and the live
  finder both call; nothing else computes it), score, role (trap or opportunity, from the learner's
  side), the current act, whether a position is a cue, and whether an opportunity is a line to pass.
  No component recomputes them.
- App state the whole feature adds: saved finds and the lichess token, each under its own storage
  key, kept as `src/resources/progress.ts` keeps progress (`storageKey`, `readStorage`,
  `writeStorage` and `subscribeStorage` from `src/context/storage.ts`), and its own parser beside
  its type, as `parseProgress` sits in `src/progress/progress.ts` (not `SavedProgress`, whose parser
  drops shapes it doesn't know, and not `Settings`, the preference record every tab syncs). The
  finder has none of its own: engine answers and lichess replies live in the Data Client store keyed
  by their request, and the finds and the next request are computed from them each render.
- Flow: lesson file or network, into the store, through the pure functions, through `guidance.ts`
  (the only place anything is hidden), into components. Components send events to reducers and never
  write derived values back.
- A score never mixes sources: the host picks one source for a whole finder run (lichess when the
  account can answer, else Maia), and its finds carry that source's name. A thin lichess position
  ends the walk there (Act III goes on, Rules). A list may show a run of each,
  lichess rows first and Maia rows labeled estimates; their scores are never combined.
- Pieces E, G, I, J, K and L must be checked on Android (touch, the haptic tick, the pager, the
  sign-in redirect, the Maia worklet in `src/maia/network.ts`, on-device search, the bookmark). H's
  dot only displays, so the web check covers it.
- Code says `opportunity`, `trap` and `mistake`, never `slip` (`practice.ts` uses that for a
  learner's non-book move).

## Rules

The gate settings are in `limits.ts`: the share floor, the estimate's coverage mark
(`estimateCoverage`, half), `keepScore`, `minGain`, the reach floor, the ply cap and the Act III
caps. Minimum games is `MIN_GAMES` beside them, which the lichess host passes to `repliesFrom`; the
finder never reads it. Piece B's gate set their values (Decisions). The cost floor is the app's
mistake limit (`MISTAKE_LOSS`, which the finder reads from `quality.ts`) and is not a gate setting.

- **Reach** of a position: the share of games that reach it, from 1 where the finder opens. Each
  order of moves into it multiplies the erring side's shares along the way (the punishing side's
  moves count 1), and the orders of fewest moves are summed (`reachOf`). A repetition or a lost
  tempo adds nothing, the start stays 1, and each game counts once. A find on the guide counts only
  the orders the guide plays (the guide's moves for the punishing side, any reply of the erring
  side), fewest among them.
- **On the guide**: a find is on the guide (`Find.onGuide`) when the guide's own moves lead the
  punishing side to one of its mistakes. Only finds on the guide are ranked, kept and written into
  lessons; the finder returns the others apart (`FinderResult.offGuide`), and the report lists them
  as evidence.
- **Score** of an opportunity for a band: the reach of the cue × gain if known. A cue several
  mistakes lead to is one find, shown by the mistake most games play into it (the reach of its
  position × its share there). A mistake whose gain is under `minGain` (0.01) is no find, since
  nearly everyone punishes it, and the walk goes on past it; an estimated gain is exempt. A find
  without a gain (a migrated trap not yet measured) has no score and lists after the scored rows.
  Ties break by reach, then by the line, so the order is stable. Found rate is still shown, derived
  from shares, but no longer breaks ties: the gain already counts who misses the punishment.
- **Gain if known**: at the cue, each reply the band plays over the share floor, weighted by its
  share, times what it gives away beside the best reply (`moveLoss` in `quality.ts`, the signed loss
  `judgement` labels by, as for cost, floored at 0 so a reply a search rates above the first line
  gives nothing), over the shares of the replies measured; where the finder measures no reply the
  gain is 0 and marked an estimate. It is what a player at the cue scores more by knowing the
  punishment than by playing as the band does: a recapture everyone finds gains nothing (6.Bxd5
  Qxd5), a cue whose natural reply is wrong gains most (5.Nxf7 Kxf7). Replies under the share floor
  are left out and the rest renormalised. Where the cue is thin, or the measured replies cover under
  the coverage mark (`estimateCoverage`) of its games, the gain is an estimate and the report marks
  it. Each measured reply the cue's final analysis doesn't list takes one full search (about 60 for
  Stafford). Deriving the gain from stored moves instead, by writing each wrong cue reply as a
  marked move, is rejected for now: it would put the learner's wrong replies in the guide tree and
  change Practice's lists. A migrated trap's gain is absent, not 0, until the importer measures it
  (piece D1 for Stafford, D3 for the rest).
- **Clearly better**: a find is kept only where the learner's expected score at Act III's end is at
  least `keepScore` (0.6, a `limits.ts` gate setting). Act III follows the band's likely replies, so
  a practical trap survives where best defence would hold (6.Bc4 Ng4 is 0.58 against best defence,
  yet the replies 1400s play walk into mate). The report marks each kept find "holds" (the cue's
  best reply alone reaches `keepScore` against best defence) or "practical" (only the band's likely
  replies get there), and lists each dropped find with its Act III end.
- **Cost**: the expected score the erring side gives away beside its best move, by `judgement` in
  `src/analysis/quality.ts`. The floor is that module's mistake limit (0.10), so every opportunity's
  first move labels as a mistake or a blunder. Cost gates a find and is the number the product
  shows; ranking no longer reads it. Screens show the live verdict.
- **Share floor**: a reply played in under 5% of the games at its position (in the band) is not
  screened. It is a bare 5% test on every reply, with none exempt as some of the list's rows are.
  `limits.ts` starts it at `RARE_SHARE` (`src/lesson/select.ts`), the share under which the list
  calls a reply rare; if the gate moves it, `limits.ts` gets its own number.
- **Minimum games**: a position fewer than 100 games reach (in the band) is too thin to judge; the
  lichess host marks it thin (`repliesFrom`), and the walk (piece A's search for mistakes) ends
  there. Act III is not the walk: at a thin position with no guide move it takes Stockfish's reply
  and goes on under its own ends, since the position after the cue can be thin when the mistake's
  position was not (only the games that played the mistake reach it). A Maia run has no thin
  positions; its walk ends at the reach floor and the ply cap.
- **Line to pass**: an opportunity whose mistake `countedReplies` counts (`src/lesson/cleanRun.ts`:
  10% over all bands, or the most played reply). Other finds show in the list and the finder but are
  never required. Piece C adds one exception to `countedReplies`, beside `COUNTED_SHARE`: a marked
  move without counts never counts (today a move without counts does). Today's traps are notes, not
  moves a clean run plays, so this keeps the migrated trap lines out of Practice's clean runs and
  steering, as they are now; without it each would become a required line. Once the importer writes
  its counts, the 10% rule applies to it like any other move.
- **The cue's accepted replies**: the punishing side's moves in the cue position's final analysis
  that label best or good beside its first line and still win at least the cost floor over the
  punishing side's score before the mistake (`acceptedReplies`). The punishing side's moves (its
  accepted replies and its Act III moves) are book moves where the punishing side is `Lesson.side`,
  else ordinary moves (a migrated trap that `Lesson.side` falls into): only `Lesson.side`, the side
  the learner plays, has book moves (`lesson.ts`, `check.ts`). Where the guide's move at a cue is
  not one of them, the find names it (`Find.guideReply`) and the report lists it, for a person to
  check before the lesson's pull request merges.
- **The erring side's Act III moves** stay ordinary moves. Where the guide already has moves at one
  of its positions, Act III follows the guide's most played move there (else its first, where no
  move has counts) and adds nothing, so the tree stays the one source for that line. Only where the
  guide has none does it add one reply: the most played, which `countedReplies` keeps, or, where the
  position is thin, Stockfish's. That reply is then the only one in the tree there, so a clean run
  plays through it, and it never adds a second line to pass (where the erring side is
  `Lesson.side`, a migrated trap, that move is not a book move, so a clean run never plays it and
  it adds no line to pass either). Where the guide's move is a better
  defence than the payoff assumed, Act III ends (its ends below); it never adds a competing move to
  force the payoff. These guide moves are every move the guide has at the erring side's position,
  book or not.
- **The punishing side's Act III moves** also prefer the guide, by a different test: where the guide
  has a move the punishing side plays there (a book move where it is `Lesson.side`, any guide move
  otherwise, as `inCleanRun` in `src/lesson/cleanRun.ts` gives), Act III follows the guide's most
  played one (else its first, where no move has counts) as long as that move gives back less than
  `MISTAKE_LOSS` beside Stockfish's best in the same position, so the tree stays the one source for
  the line; otherwise, or where the guide has none, it plays Stockfish's best, which the importer
  writes into the tree beside the guide's (a book move where the punishing side is `Lesson.side`, an
  ordinary move otherwise, so the tree stays the one source there too). Each position where the
  guide's move is not Stockfish's best is in `Find.disagreements`, from which piece B's report
  counts the positions where the two differ and how often Act III kept the guide's move, and lists
  each override, as the lesson's D1 or D3 pull request does: the guide's own move costs a mistake's
  worth there, so a person looks at it before merge.
- **Act III** follows those moves for both sides, and ends where the game is over (`gameResult`:
  mate, stalemate, insufficient material, the fifty-move rule; its end score is then the game's
  result), when the win is obvious, after six of the punishing side's moves, or where, after an
  erring-side guide move it follows, what the punishment still wins is under `MISTAKE_LOSS` (the
  cost floor): the punishing side's score there less its score before the mistake, both signed by
  `forSide` (a difference near a limit must not round, as `judgement` measures). The win is obvious
  (`obviouslyWon`) where the punishing side is winning (an expected score of at least 0.8, by
  `scoreFor` in `src/evaluation/evaluation.ts`), has no mate to play out, is not behind in material
  (`balance` in `src/game/material.ts`), and either its second-best move is also winning or it is
  three points of material up. `keepScore` then judges the find at that end, as it judges every
  find. The 0.8, the three points and the six moves are `limits.ts` settings.
- **Sketch and full**: a sketch is a search that reached at least `SKETCH_DEPTH`
  (`src/evaluation/evaluation.ts`); full is the app's search (`APP_SEARCH`). Sketches screen
  replies; only full searches confirm a find or set a stored cost or gain; the live list's gain may
  rest on sketches until full results arrive. Analyses stay keyed as the store keys them.

## Pieces

### Piece A: Finder core

`src/opportunity/`, pure like `src/review/`: no React, lichess, Stockfish builds or file access.
Tests use hand-made fixture answers, including the Stafford 6.Bg5 find.

- One function of the answers known so far, like the review's `nextSearch`: it takes the start line,
  the side looking for opportunities, the limits, and lookups for the replies (each move's share of
  the games at the position, and whether the position is too thin to judge; `repliesFrom` turns
  lichess counts into that, giving no share to a move `recordedMove` rejects while its games still
  count toward the total, so the replies hold only legal moves), analyses (sketch or final) and the
  guide's moves (a lesson's moves at a position, most played first: every guide move at the erring
  side's turn, and at the punishing side's turn those it plays, as Rules define them) that the host
  has so far. It returns the finds so far (kept ones, those dropped as not clearly better, and,
  apart, those off the guide; Rules), where walks ended thin, and the requests still missing, most
  useful first: a position's replies, a sketch, or a full search, each naming its line and position.
  It takes no band: the host's answers already belong to one. The script loops over it; the app
  derives it from the store. No async generator and no queue. The hosts filter the punishing side's
  moves by `inCleanRun` (`src/lesson/cleanRun.ts`), the rule `walkShared` in `openings.ts` already
  applies inline.
- The walk is best-first by reach from the start (reach 1), on `LikeliestFirst`
  (`src/lesson/likeliestFirst.ts`, made generic over what it holds). At the erring side's turn it
  screens every reply over the share floor with a sketch, confirms each reply at or over the cost
  floor with full searches, then asks for the cue position's replies (found rate) and has Act III
  built from there (Act III is not part of the walk). Replies under the cost floor, and mistakes
  whose gain is under `minGain`, continue the walk. At the punishing side's turn it follows the
  guide's moves, else Stockfish's best. The walk stops where the game is over (a move that ends the
  game is neither screened nor walked past), below the reach floor (counted along the move order it
  arrived by, since the walk is best-first by that), past the ply cap (it screens the position
  exactly that many plies past where the finder opens), or at a thin position; Act III continues
  past a thin position (Rules). One find per cue position; a position reached again is not walked
  again, though another order of the same moves adds to its reach (Rules). Every move the finder
  plays goes through `legalChild` (`walk.ts`), which throws on an illegal one, since each source
  promises legal moves: the lesson checker for the guide, Stockfish, and `repliesFrom` for the
  explorer.
- Its own floors and caps are named settings in `src/opportunity/limits.ts`, set at piece B's
  gate: the share floor (`RARE_SHARE`), the estimate's coverage mark, `keepScore` and `minGain` from
  Rules, the Act III caps, a reach floor (0.5%) and a ply cap (24 plies past where the finder
  opens). Minimum games is `MIN_GAMES` beside them, for the lichess host (Rules).
- The cost floor has no value of its own: the finder reads `MISTAKE_LOSS` from `quality.ts`, where
  piece A exports it and `moveLoss` (the signed loss `judgement` labels by) and builds
  `LEAST_LOSS`'s mistake entry from it, so 0.10 lives in one place. The gate does not change it,
  since that would change the app's mistake label too.

### Piece B: Report script

A script that runs the core over the Stafford lesson only, with the importer's lichess explorer
(`lichessExplorer`, `scripts/import-study/popularity.ts`) and Node Stockfish, and writes a ranked
report to the project files. It changes no lesson file. Its answers go in its own files,
`scripts/import-study/answers/<id>-opportunities-*.jsonl`, which no other step prunes (as
`coverOpponent.ts` keeps its own; piece D1 reads them); commit them. It runs on lichess only: a thin
position ends the walk (the search for another mistake; each find's Act III still finishes, Rules),
and the report counts how many walks ended thin and at what depth, so the gate can judge whether a
Maia supplement in the script is worth building. None is built now.

Gate: Nathaniel reads the top 20 finds and the dropped ones and sets the `limits.ts` settings that
Rules and piece A name (not the cost floor) before any lesson file changes. The report prints the
limits it ran with. Set 2026-11-24 (Decisions).

### Piece C: Lesson data

- Format: `LessonPosition.games` (games reaching the position, per band of
  `Lesson.popularity.ratingBands`; absent means not measured) and `LessonMove.mistake` (`{ cost?,
  gain?, name?, verdict? }`: cost (one value) and gain (one per band of
  `Lesson.popularity.ratingBands`) as above, absent only on migrated guide traps until the importer
  step measures them (piece D1 for Stafford, D3 for the rest); `name` a short title for the list;
  `verdict` the `Trap` verdict it replaces). All optional, so the format number stays 3.
- The `Trap` idea goes. Each existing trap idea (254: 172 in position notes, 82 in move notes)
  becomes guide-tree moves with the marker on its first move. A note whose only drawn idea was the
  trap moves to the marked move; a note with other ideas keeps them and its text where it was. A
  marked move of the learner's side is not a book move, so the checker's traversal (book moves for
  the learner, every opponent move) does not follow it; a position a book line also reaches still
  needs a book move, and there is no exemption for positions after a marked move.
- The app reads the new shape. The trap card, its playback and landing (`LandedTrap`) behave as
  before, except for the "show traps" scope in Decisions (before, it hid every trap). The marker
  takes over two call sites of the `Trap` idea: a landed trap still explains itself with show traps
  off (`guidance.ts`), and a marked move stays out of the rare rows (`trapStarts` in
  `src/lesson/select.ts`).
- `src/lesson/share.ts` above, with `gamesPlayed` moved into it, and every caller it names moved
  onto it: `candidates` and `countedReplies` gain the position's total as a parameter, `moveShares`
  keeps its floor and book-only scaling, and `repliesFrom` and `coverOpponent.ts` drop their own
  ratio. Also `countedReplies`' exception for a marked move without counts (Rules).
- Checker rules for marked moves (legal; `cost` at or over the floor when present). README for
  `assets/lessons/` and `AGENTS.md` updated.
- No new finds: shipped lessons change only by the migration, rebuilt by the importer from committed
  answers.

### Piece E: Cue and three acts

In Explore, after the erring side plays a marked move into a cue, `guidance.ts` hides the
candidates, Stockfish's best and verdicts until the learner tries (Practice's existing "hide every
hint" branch); a `screen.ts` cue state holds the tries with Retry, Show the move and Skip, judged by
`labelMove`, not `src/review/retry.ts` (tied to a finished game). A booked reply passes; any other
passes only where it meets the Rules' accepted-reply test (piece A's `acceptedReplies`: best or
good, still winning the cost floor over the score before the mistake; those replies are book moves
where the punishing side is `Lesson.side`, Rules); Act III plays back through the lesson opponent; a
haptic tick (`haptic('moveLanded')`, `src/components/haptics.ts`) marks the cue in Explore. Wide
layout, and the phone layout on the redesign's two panes: three act rows on the left, one line and
three icon buttons on the right. Waits on the phone redesign's panes. Starts with a design review of
whether the cue is a third mode-like state in `screen.ts`, and records its outcome here before
building. The starting proposal: a try is a board preview until it passes, then a move through
`useGame` (the screen reducer does not own the game); Act III reuses peek's playback, which does not
move the game; the three acts replace the trap card for a marked line, so landing stays the one
trigger.

### Piece F: Practice and marks

The Practice opponent steers into each opportunity that is a line to pass until it is passed
(`steering` in `marks.ts`, the clean run in `cleanRun.ts`); seen and passed marks reuse the progress
store. After E.

### Piece H: Reply-row marks

A red dot and the live cost on a marked move's row in the reply list, in Explore only. After F,
since E, F and H all touch `guidance.ts`, `screen.ts` and the candidate list.

### Piece D1: Importer step on Stafford

An opportunities step in `scripts/import-study`, before the explain step (popularity stays last),
that runs the finder for the lesson's side, fed by piece B's answers files and the explorer
directly: it asks the explorer about every position on a find's path and writes, from that one
answer, `LessonPosition.games` (the explorer's own count of games reaching the position, which
`lichessExplorer` must start returning, never a sum of the listed moves) and every move's counts.
The explorer's cached rows gain a total for this: when asked for a total, `lichessExplorer` treats a
cached row without one as missing, so the positions on a find's path are asked again and their new
answers committed in the same PR, keeping reruns exact. Elsewhere a row without a total reads it as
unknown, never as 0 or as enough games. Then it writes the marked move with its cost and its gain
per band, and the accepted replies and Act III as Rules say. Popularity, which runs after it, must
not drop counts it did not remeasure (today it drops them wherever it did not ask, such as positions
with one guide move), and where it does remeasure it writes the position total from that same
answer. Stafford only, with B's floors. The D1 PR lists the rows whose rare-row or counted-reply
status changed once the totals change shares, and each Act III override of a guide move
(Rules). Merges after E and F, because new lines change what the Practice opponent plays.

### Piece D2: Names and notes

The explain step writes each marker's `name` and one short note per Act III move of the punishing
side, under its current guards; answers in `answers/<id>-explain.jsonl`. An audit sample is graded
before it lands.

### Piece D3: Rollout

The step runs on every lesson; `--no-model` rebuilds each exactly. The PR lists, per lesson, the
rows whose rare-row or counted-reply status changed and each Act III override of a guide move.
Cap finds per lesson by score if the files grow too much for phones (the Caro-Kann file is already
5.3 MB).

### Piece G: List page

Opportunities for the lesson and the band, ranked by score (a migrated trap without a gain yet lists
after the scored rows), each row with reach, how often and payoff (the cost) meters and the passed
mark; tapping a row plays Act I and hands over the board at the cue. A section in the wide panel; on
phones the pager's leftmost page (opportunities, lesson, scoresheet), holding the list and the
finder's "from this position" button and source chip. The band is the opponent setting's, by
`opponentBand` in `src/lesson/select.ts` as Practice picks it. Waits on the redesign's pager and on
D1.

### Piece I: lichess connection

Sign in with lichess from the settings sheet (OAuth for apps without a server), the token kept on
the device under its own storage key (Shape), and a Data Client endpoint for the explorer with the
importer's pacing (one request every 2.5 s, moved from `popularity.ts` into a shared module both
import) and castling conversion (`lineMove` in `src/game/replay.ts`). Starts with a spike: may a
browser page and the Android app call the explorer with a user's token, and does the sign-in
redirect work on GitHub Pages and Android. If not: Maia only in the app, real counts only in shipped
lessons. `/privacy` and the Play listing's Data safety answers updated.

### Piece J: Maia shares

Reply shares from Maia's policy scores for the legal moves (the scores themselves are not shares). J
extracts the legal-move scan from `bestMove` in `src/maia/maia.ts` into a shared helper that yields
each legal move (the chessops move) with its policy slot, rebuilds `bestMove` on it (still returning
that move's UCI, so a castle stays the king taking its rook there), and exports the private
`softmax` from `src/maia/network.ts` to apply to those slots' scores only. Each share is keyed by
`lineMove` of the move (`src/game/replay.ts`), the name lesson lines and the game record, so a
castle's share matches the line. The shares form a host source labeled `maia` for a whole run.
Checks first how close they come to lichess's at the same rating. Maia finds are labeled estimates
and listed after lichess ones, never ranked together.

### Piece K: Finder in the app

The core run from any position, derived from the store and memoized on its only inputs, the answers
it reads: engine answers through `useAnalysis` and replies through I or J. It has no queue of its
own. Finds join the list page as they are confirmed, each number's source labeled. The cue
replies' searches for the gain run at sketch depth first, and the ranking updates as full results
arrive, with no stored list.
The finder's searches use the existing Stockfish watch and queue behind whatever the board is
watching: they never become the newest request (the engine searches the newest position first) while
the board shows a position, or `decide` would stop the bar's and the lesson's searches. Measures
first how long the first find takes on a phone, with lichess's pacing (one request every 2.5 s) and
with Maia. After A, G, I and J.

### Piece L: Saved finds

A bookmark saves a find on the device as the same lesson fragment the importer writes (the line, the
marked move, the cue's replies and Act III), under its own storage key with its own versioned parser
(Shape; unknown versions are ignored), so it plays back through E's code. `/privacy` and the Play
listing's Data safety answers updated for the new stored value. After K and E.
