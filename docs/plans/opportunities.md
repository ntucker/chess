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
  reaching the cue × gain if known (Rules). This replaces the product plan's "how often × how bad ×
  reach", agreed by Nathaniel 2026-11-24 after the Stafford report ranked recaptures everyone finds
  (6.Bxd5 Qxd5, played by 100%) above finds whose natural reply is the wrong one (5.Nxf7, where 76%
  recapture and 8% find 5...Qe7). A find is kept only where Act III leaves the learner clearly
  better.
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
- Piece B's gate (2026-11-24, #210), left to the build thread by Nathaniel and agreed by the
  planning thread. Only finds on the guide count. Score is games reaching the cue × gain, with reach
  counting every way in (Rules), since 5.d3 Bc5 6.Nc3 and 5.Nc3 Bc5 6.d3 share a cue. `minGain`
  drops the recaptures nearly everyone finds. The reach floor is 0.5%, since 1% missed 8.Ke1 Qh4+ on
  the guide. Rules hold the details and `limits.ts` the values.

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
  | The line a mistake starts                | The guide tree from the marked move (`mistakeLine`)    |
  | That line, where the guide would differ  | `line` on that marker, the moves after it              |

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
- Derived, one pure function each in `src/opportunity/`: reach (`reachOf`, Rules), the cue's
  accepted replies (`acceptedReplies`, Rules), found rate (the sum of their shares at the cue), gain
  if known (`gainIfKnown`, `src/opportunity/gain.ts`, which the importer and the live finder both
  call; nothing else computes it), score, role (trap or opportunity, from the learner's side), the
  current act, whether a position is a cue, and whether an opportunity is a line to pass. No
  component recomputes them.
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

The gate settings are in `limits.ts`, set at piece B's gate; `MIN_GAMES` sits beside them for the
lichess host's `repliesFrom`. The cost floor is `MISTAKE_LOSS` (`quality.ts`), the app's mistake
limit, and is not a gate setting.

- **Reach** of a position: the share of games that reach it when the punishing side steers toward
  it, from 1 where the finder opens (`reachOf`). The erring side's replies add up, weighted by
  share; where the punishing side has several moves (two book moves), it takes the one that gets
  there most, since it chooses. Only orders of fewest moves count, so a repetition or a lost tempo
  adds nothing. A find on the guide counts only the moves the guide plays. Each find assumes the
  punishing side steers toward it, so finds after different book moves at one position each show
  their full reach: they are alternatives, not additive. Reach is derived, never stored.
- **On the guide**: a find is on the guide (`Find.onGuide`) when the guide's moves reach a position
  where the erring side plays a mistake into its cue. Only these are ranked, kept and written into
  lessons; the rest come back apart (`FinderResult.offGuide`), as evidence.
- **Score** of an opportunity for a band: the reach of the cue × gain if known. A cue several
  mistakes lead to is one find, shown by the mistake most games play (the reach of its position ×
  its share). A gain under `minGain` makes no find, since nearly everyone punishes the mistake, and
  the walk goes on past it; an estimated gain is exempt. A find without a gain (a migrated trap not
  yet measured) has no score and lists last. Ties break by reach, then by the line. Found rate is
  shown but breaks no ties: the gain already counts who misses the punishment.
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
  the learner plays, has book moves (`lesson.ts`, `check.ts`). A guide move at a cue that isn't one
  of them is listed in the report (`Find.guideReply`) for a person to check before merge.
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
  ordinary move otherwise, so the tree stays the one source there too). Piece B's report counts how
  often Act III kept the guide's move and lists each override (`Find.disagreements`), as the
  lesson's D1 or D3 pull request does: the guide's own move costs a mistake's worth there, so a
  person looks at it before merge.
- **Act III** follows those moves for both sides. It ends where the game is over (`gameResult`; its
  end score is then the result), at an obvious win, after six of the punishing side's moves, or
  where, after an erring-side guide move, the punishment wins less than `MISTAKE_LOSS` over the
  punishing side's score before the mistake (both signed by `forSide`, unrounded, as `judgement`
  measures). The win is obvious (`obviouslyWon`) when the punishing side scores at least 0.8
  (`scoreFor`), has no mate to play out, isn't behind in material (`balance`), and either its
  second-best move also wins or it is three points up. `keepScore` judges the find at that end. The
  0.8, the three points and the six moves are `limits.ts` settings.
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
  lichess counts into that, dropping moves `recordedMove` rejects but counting their games),
  analyses (sketch or final) and the guide's moves (a lesson's moves at a position, most played
  first: every guide move at the erring side's turn, and at the punishing side's turn those it
  plays, as Rules define them) that the host has so far. It returns the finds so far (kept, dropped
  as not clearly better, and off the guide; Rules), where walks ended thin, and the requests still
  missing, most useful first: a position's replies, a sketch, or a full search, each naming its line
  and position. It takes no band, since the host's answers belong to one. The script loops over it;
  the app derives it from the store. No async generator and no queue. The hosts filter the punishing
  side's moves by `inCleanRun` (`src/lesson/cleanRun.ts`), the rule `walkShared` in `openings.ts`
  already applies inline.
- The walk is best-first by reach from the start (reach 1), on `LikeliestFirst`
  (`src/lesson/likeliestFirst.ts`, made generic over what it holds). At the erring side's turn it
  screens every reply over the share floor with a sketch, confirms each reply at or over the cost
  floor with full searches, then asks for the cue position's replies (found rate) and has Act III
  built from there (Act III is not part of the walk). Replies under the cost floor, and mistakes
  whose gain is under `minGain`, continue the walk. At the punishing side's turn it follows the
  guide's moves, else Stockfish's best. The walk stops where the game is over, below the reach floor
  (along the path it arrived by, since it is best-first by that), past the ply cap (counted in
  full), or at a thin position; Act III continues past a thin position (Rules). One find per cue; a
  position reached again isn't walked again, but its reach counts every way in (Rules). Every move
  goes through `legalChild` (`walk.ts`), which throws on an illegal one, since every source promises
  legal moves.
- Its own floors and caps are named settings in `src/opportunity/limits.ts`, set at piece B's gate:
  the share floor (`RARE_SHARE`), the estimate's coverage mark, `keepScore` and `minGain` from
  Rules, the Act III caps, a reach floor (0.5%) and a ply cap (24 plies past where the finder
  opens). `MIN_GAMES` sits beside them (Rules).
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
  gain?, name?, verdict?, line? }`: cost (one value) and gain (one per band of
  `Lesson.popularity.ratingBands`) as above, absent only on migrated guide traps until the importer
  step measures them (piece D1 for Stafford, D3 for the rest); `name` a short title for the list;
  `verdict` the `Trap` verdict it replaces; `line` below). Format 4: a note's trap idea becomes a
  `mistake` idea naming the marked move, which an older app can't read.
- The `Trap` idea goes. Each existing trap idea (254: 172 in position notes, 82 in move notes)
  becomes guide-tree moves with the marker on its first move. A guide trap's line is the author's
  content and is kept exactly: every move of it goes into the tree where it isn't there yet, the
  learner's punishing moves as book moves where the guide books no other (as Act III writes them),
  every other move as an ordinary one. Only a trap that keeps its mark writes moves: of two traps
  with one first move, the first in file order, and none whose mark the engine check or the
  checker takes off (the importer builds the lesson again keeping only the marks that survived,
  until no other goes), so the lesson behaves as before apart from its kept traps. The line a
  marked move starts is read from the tree
  (`mistakeLine`, `src/lesson/mistakes.ts`): the marker's `line` (the moves after it, each a guide
  move at its position) where stored, else at each position the first move by Act III's choice rule
  (`guideOrder`: the learner's book move where it punishes, or the most played unmarked move off
  the book, where it has none; the opponent's most played unmarked move where it punishes; the
  most played move where the erring side moves), ending where the tree does or on a
  repetition. `line` is stored exactly where that rule wouldn't give the intended line (it would
  play another branch, or go on past its end), and the importer keeps it so when popularity counts
  change the rule's pick. The same rule covers the lines the finder builds (D1, D3): an Act III that
  ends before the tree does, or leaves the rule's branch, stores `line`, so piece E reads one stored
  end for both. Where one first move has two study lines, the mark keeps the first note's, and the
  PR lists the other. The note stays where it was, and its trap idea becomes a
  `{ type: 'mistake', move }` idea naming the marked move, from which the app derives the trap
  card's line. The engine judges each marker on its study line; the importer reports each trap
  whose line comes out other than the study wrote it, and each whose mark the engine overruled or
  whose verdict its line contradicts (that mark goes with the notes naming it). A marked move of the learner's side is not a book move, so the checker's
  traversal (book moves for the learner, every opponent move) does not follow it; a position a book
  line also reaches still needs a book move, and there is no exemption for positions after a marked
  move. A marked move never satisfies or cancels the need for a book move: a learner position
  inside the book whose other moves are all marked still needs one, which `fillBook` picks as
  usual (`needsBookMove`, `src/lesson/cleanRun.ts`; decided with the planning thread in #224).
- The app reads the new shape. The trap card, its playback and landing (`LandedTrap`) behave as
  before, except for the "show traps" scope in Decisions (before, it hid every trap). The marker
  takes over two call sites of the `Trap` idea: a landed trap still explains itself with show traps
  off (`guidance.ts`), and a marked move stays out of the rare rows (`trapStarts` in
  `src/lesson/select.ts`).
- `src/lesson/share.ts` above, with `gamesPlayed` moved into it, and every caller it names moved
  onto it: `candidates` and `countedReplies` gain the position's total as a parameter, `moveShares`
  keeps its floor and book-only scaling, and `repliesFrom` and `coverOpponent.ts` drop their own
  ratio. Also `countedReplies`' exception for a marked move without counts (Rules).
- Checker rules for marked moves (legal; not a book move; `cost` at or over the floor when present;
  `line` made of guide moves and stored only where the choice rule plays another; a `losesMaterial`
  verdict holds on the line; a `mistake` idea names a marked move at its position; an opponent's
  mark whose cue a clean Practice run reaches (the book-move walk: learner book moves, any opponent
  move) must book its line's reply). README for
  `assets/lessons/` and `AGENTS.md` updated.
- No new finds: shipped lessons change only by the migration, rebuilt by the importer from committed
  answers.

### Piece E: Cue and three acts

After the side the learner doesn't play plays a marked move, the learner answers it at the cue.
Revised 2026-11-25 (Nathaniel's decision card: "Explore reveals, Practice tests"; rules agreed with
the planning thread). The mode is the only switch between revealing and testing: the cue adds no
hiding, no test and no stored state of its own. The first build (#229) hid every hint at an open
cue in Explore, held the board after a wrong try, judged tries from Stockfish's final answers and
offered Retry, Show the move and Skip; the revision removes all of it.

- The cue is not a mode. It is derived from the line (`lineCue`, `src/opportunity/cue.ts`, carried
  as `LessonView.cue`): the latest marked guide move, up to the board, played by the side that
  isn't `Lesson.side`. It needs no note naming the mark, so finder marks work. It records the game's
  move at the cue (`tried`) and whether it punishes the mistake (`found`: the line's reply, or a
  move the guide books there). A mark the study already made keeps its moves, so `withFinds` only
  adds `cost` and `gain` there; a find on a new mark books every accepted reply (Rules). The
  checker rule that a mark whose cue a clean Practice run reaches books its line's reply (piece C)
  makes `found` and the clean run agree wherever the run is still clean. A learner-falls trap keeps
  the trap card and `LandedTrap`.
- Explore (`cueActs` in `guidance.ts`): the three acts and the "Your cue." headline beside every
  hint, as on any Explore position, from the cue along the line's moves the game plays, and as news
  of the line's end. A move off the line ends them at once and keeps only its ordinary move label.
  A note before the mistake that names the answer still shows (Nathaniel, 2026-11-25: Explore is
  where the learner reads). Act III: the lesson opponent plays the line's moves (`payoffReplies`,
  since the band's most played can differ from the line).
- Practice: the cue is an ordinary learner turn. Hints hide as on any learner turn, and nothing
  names the cue before the move, since naming it would hint that a punishment exists. The test is
  Practice's own: a book move keeps the run clean, anything else is the usual non-book move. After
  the learner's move a card says found or missed (`Guidance.opportunity`), from that move along the
  line and as news of its last move, the way a trap fallen into shows its card. No hold and no
  extra controls: Practice's take-back and retry apply.
- Where the acts or the Practice card show, the mistake's trap (when a note names it) shows its
  note there rather than on its own card (`Guidance.trapIn`). All of it is decided in `guidance.ts`.
- A haptic tick (`haptic('moveLanded')`) marks the cue in Explore when the opponent plays the
  mistake, not when the screen opens at the cue or the board steps back onto it. A mistake the
  learner plays for the other side ticks as their own move.
- Wide and phone: the acts as chips in a card where the trap card goes (on a phone, above the
  pages, as the trap card is), with the guide's note once the punishment lands; the Practice card
  in the same place.

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

As built (`scripts/import-study/finds.ts`, on lessons whose recipe sets `opportunities`, settled
with the planning thread 2026-11-25):

- The finds are the kept on-guide finds of one band's run, 1400 (`FIND_BAND`, the report's, where
  B's gate set the limits), so the lesson holds exactly the report's rows; a test pins them. A
  mistake common only in another band is not written yet; that is a known limit. Each find's gain
  is measured in every band, from that band's replies at the cue (and a full search of each reply
  the cue's analysis doesn't list).
- The finder picks guide moves by their counts (`guideOrder`), but the step runs before popularity,
  so it reads a copy of the lesson counted from the cached explorer answers, as the report reads the
  shipped file, and writes into the uncounted lesson.
- The explorer answers with totals go into the lesson's popularity answers file
  (`<id>-explorer.jsonl`), and one explorer serves the step and popularity in a run, so where
  popularity asks about a path position it reads the same answer and its save keeps the step's.
  The walk itself still reads B's `<id>-opportunities-explorer.jsonl`, whose answers have no total,
  so the finder's shares are over the listed moves while the written gains are over each position's
  games. On the Stafford lesson the two agree: every written 1400 gain equals the report's to the
  point (checked 2026-11-25 against `yarn opportunities stafford`).
- The counts go on the line each mark plays (`mistakeLine`): the find's own path, except where the
  guide already marked the mistake (a migrated trap), whose mark keeps the guide's line. The counts
  can change the guide's choices, so the step then keeps every mark's line as it was
  (`keepMistakeLines`), and the line counted is the line played.
- The step needs popularity: `--no-popularity` skips it, since gains are per rating band.
- Costs and gains are stored to a thousandth.

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
