# Opportunities

An opportunity is a position where a real opponent is likely to play a bad move, and the way to
punish it is not obvious. Opening Night finds them from lichess game counts and Stockfish, and
teaches each one in three acts by letting the learner play it. Example, from the Stafford Gambit at
the 1400 band: 36% of White players reach 5.d3 Bc5 (Act I, the setup); 15% of them then play 6.Bg5,
which gives away 43% of White's winning chances, and Black answers 6...Nxe4 (Act II, "Your cue.");
7.Bxd8 Bxf2+ 8.Ke2 Bg4# follows (Act III, the payoff).

Product plan with mockups: [product plan](https://claude.ai/artifact/Bun3eWNJZdbhDW2iAv9vAZ).
Technical plan and its adversarial review: [technical
plan](https://claude.ai/artifact/W7ri91SoRGYDqHcowjnz33). This file restates both as built; where
they differ, this file wins. Each piece's section holds the rules it builds, so the plan doesn't
depend on those links.

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
- The finder opens at any position (in a lesson, past a guide, in free play) and finds can be saved
  on the device. Publishing finds to other users is later and not in this plan.
- In the app, "how often" comes from the learner's connected lichess account, else (no account, or
  too few games) Maia on the device, as its own run. Each number says which source it came from.
- In Practice, an opportunity common enough to count (see "Line to pass" in Rules) is a line to
  pass, and the opponent steers into it until it is passed. Inside one, the opponent also walks
  every reply played 10% or more. A dice mode (real rates) and guides extended to every common reply
  are future ideas, not started.
- Names: "Opportunities" for the list, "Your cue." for the moment.
- Phones are first-class. The phone screens build on the phone redesign's two panes and pager.
- Saved progress is not migrated: new lines can reopen rows a learner already passed. Release notes
  say so.

## Shape

- One home for each fact. Nothing derivable is stored, and every PR lists each new stored field or
  app state and why it can't be derived; a field that can be computed from those below fails review.

  | Fact                                     | Its one home                                           |
  | ---------------------------------------- | ------------------------------------------------------ |
  | The moves of a line                      | The guide tree (`LessonPosition.moves`), as today      |
  | Games per move, per band                 | `LessonMove.games`, as today                           |
  | Games reaching a position, per band      | New: `LessonPosition.games`                            |
  | This move is the mistake                 | New: `LessonMove.mistake`, a marker on the erring move |
  | How much the mistake gives away (import) | `cost` on that marker, used only to rank the list      |
  | The mistake's title in the list          | `name` on that marker, written by the explain step     |
  | The guide's verdict on a migrated trap   | `verdict` on that marker (today `Trap.verdict`)        |

- A move's share has one definition, one function that `candidates` in `src/lesson/select.ts`,
  Practice's rare-row and counted-reply rules, and the finder's lichess host (`repliesFrom`) all
  call: its games over the position's explorer total where `LessonPosition.games` exists, else over
  the sum of the listed moves' games (older data). No lesson changes behavior until D1 or D3 writes
  its totals; then that lesson's shares get smaller, since unlisted moves join the denominator, and
  its rare rows and counted replies can shift slightly. From Maia, a share is a softmax over the
  legal moves' policy scores (piece J).
- Derived, one pure function each in `src/opportunity/`: reach (shares of the erring side's moves
  multiplied along the path), found rate (the sum of the accepted replies' shares at the cue),
  score, role (trap or opportunity, from the learner's side), the current act, whether a position is
  a cue, and whether an opportunity is a line to pass. No component recomputes them.
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
  ends the walk there. A list may show a run of each, lichess rows first and Maia rows labeled
  estimates; their scores are never combined.
- Pieces E, G, I, J, K and L must be checked on Android (touch, the haptic tick, the pager, the
  sign-in redirect, the Maia worklet in `src/maia/network.ts`, on-device search, the bookmark). H's
  dot only displays, so the web check covers it.
- Code says `opportunity`, `trap` and `mistake`, never `slip` (`practice.ts` uses that for a
  learner's non-book move).

## Rules

The share floor and minimum games are starting values, tuned at piece B's gate. The cost floor is
the app's mistake limit and is not a gate setting.

- **Score** of an opportunity for a band: reach × share × cost. Ties: the lower found rate ranks
  first, since teaching pays most where players miss the punishment.
- **Cost**: the expected score the erring side gives away beside its best move, by `judgement` in
  `src/analysis/quality.ts`. The floor is that module's mistake limit (0.10), so every opportunity's
  first move labels as a mistake or a blunder. A stored cost only ranks; screens show the live
  verdict.
- **Share floor**: a reply played in under 5% of the games at its position (in the band) is not
  screened.
- **Minimum games**: a position fewer than 100 games reach (in the band) is too thin to judge; the
  lichess host marks it thin, and the walk ends there. A Maia run has no thin positions; it ends at
  the reach floor and the ply cap.
- **Line to pass**: an opportunity whose mistake `countedReplies` counts (`src/lesson/cleanRun.ts`:
  10% over all bands, or the most played reply). Other finds show in the list and the finder but are
  never required. Piece C adds one exception to `countedReplies`, beside `COUNTED_SHARE`: a marked
  move without counts never counts (today a move without counts does). Once the importer writes its
  counts, the 10% rule applies to it like any other move.
- **The cue's accepted replies**: the punishing side's moves in the cue position's final analysis
  that label best or good beside its first line and keep at least the cost floor of the gain. Only
  the learner's side has book moves (`lesson.ts`, `check.ts`), so the importer writes every accepted
  reply, and the punishing side's Act III moves, as book moves where the punishing side is the
  lesson's side (the format's `Lesson.side`), and as ordinary moves where it is not, as in a
  migrated trap the learner's side falls into.
- **The erring side's Act III moves** stay ordinary moves. At each of its positions Act III takes
  one reply: the most played, which `countedReplies` keeps, or, where the position is thin,
  Stockfish's. A thin position's reply is then the only one in the tree there, so a clean run plays
  through it, and it never adds a second line to pass.
- **Act III** follows the punishing side's best move and the erring side's most played reply (else
  Stockfish's), and ends at mate, when the punishing side is three points of material up (`balance`
  in `src/game/material.ts`) and winning (the punishing side's expected score of at least 0.8, by
  `scoreFor` in `src/evaluation/evaluation.ts`), when its second-best move is also winning, or after
  six of its moves. The 0.8 and the three points are `limits.ts` constants tuned at piece B's gate.
- **Sketch and full**: a sketch is a search that reached at least `SKETCH_DEPTH`
  (`src/review/order.ts`); full is the app's search (`APP_SEARCH`). Sketches screen replies; only
  full searches confirm a find or set a stored cost. Analyses stay keyed as the store keys them.

## Pieces

### Piece A: Finder core

`src/opportunity/`, pure like `src/review/`: no React, lichess, Stockfish builds or file access.
Tests use hand-made fixture answers, including the Stafford 6.Bg5 find.

- One function of the answers known so far, like the review's `nextSearch`: it takes the start line,
  the side looking for opportunities, the band, the limits, and lookups for the replies (each move's
  share of the games at the position, and whether the position is too thin to judge), analyses
  (sketch or final) and the punishing side's own moves (a lesson's book moves, where it has some)
  that the host has so far. It returns the finds so far and the requests still missing, most useful
  first: a position's replies, a sketch, or a full search, each naming its line and position. The
  script loops over it; the app derives it each render. No async generator and no queue.
- The walk is best-first by reach from the start (reach 1). At the erring side's turn it screens
  every reply over the share floor with a sketch, confirms each reply at or over the cost floor with
  full searches, then asks for the cue position's replies (found rate) and builds Act III. Replies
  under the cost floor continue the walk. At the punishing side's turn it follows the given moves,
  else Stockfish's best. It stops below a reach floor, past a ply cap, or at a thin position. One
  find per cue position; a position reached again adds nothing.
- Its own floors and caps are named constants in `src/opportunity/limits.ts`, tuned at piece B's
  gate: the share floor and minimum games from Rules, the Act III caps, a reach floor (1%) and a ply
  cap (24 plies past where the finder opens).
- The cost floor has no value of its own: `limits.ts` reads it from `quality.ts`, where piece A
  exports `MISTAKE_LOSS` and builds `LEAST_LOSS`'s mistake entry from it, so 0.10 lives in one
  place. The gate does not change it, since that would change the app's mistake label too.

### Piece B: Report script

A script that runs the core over the Stafford lesson only, with the importer's lichess explorer
(`lichessExplorer`, `scripts/import-study/popularity.ts`) and Node Stockfish, and writes a ranked
report to the project files. It changes no lesson file. Its answers go in its own files,
`scripts/import-study/answers/<id>-opportunities-*.jsonl`, which no other step prunes (as
`coverOpponent.ts` keeps its own; piece D1 reads them); commit them. It runs on lichess only: a thin
position ends the walk, and the report counts how many walks ended thin and at what depth, so the
gate can judge whether a Maia supplement in the script is worth building. None is built now.

Gate: Nathaniel reads the top 20 finds and sets the `limits.ts` floors and caps (not the cost floor)
before any lesson file changes. The report prints the limits it ran with.

### Piece C: Lesson data

- Format: `LessonPosition.games` (games reaching the position, per band of
  `Lesson.popularity.ratingBands`; absent means not measured) and `LessonMove.mistake` (`{ cost?,
  name?, verdict? }`: cost as above, absent only on migrated guide traps until piece D1's importer
  step measures it; `name` a short title for the list; `verdict` the `Trap` verdict it replaces).
  All optional, so the format number stays 3.
- The `Trap` idea goes. Each existing trap idea (254: 172 in position notes, 82 in move notes)
  becomes guide-tree moves with the marker on its first move. A note whose only drawn idea was the
  trap moves to the marked move; a note with other ideas keeps them and its text where it was. A
  marked move of the learner's side is not a book move, so the checker's walk (book moves for the
  learner, every opponent move) does not follow it; a position a book line also reaches still needs
  a book move, and there is no exemption for positions after a marked move.
- The app reads the new shape. The trap card, its playback and landing (`LandedTrap`) behave as
  before, except for the "show traps" scope in Decisions (before, it hid every trap). The marker
  takes over two call sites of the `Trap` idea: a landed trap still explains itself with show traps
  off (`guidance.ts`), and a marked move stays out of the rare rows (`trapStarts` in
  `src/lesson/select.ts`).
- Checker rules for marked moves (legal; `cost` at or over the floor when present). README for
  `assets/lessons/` and `AGENTS.md` updated.
- No new finds: shipped lessons change only by the migration, rebuilt by the importer from committed
  answers.

### Piece E: Cue and three acts

In Explore, after the erring side plays a marked move into a cue, `guidance.ts` hides the
candidates, Stockfish's best and verdicts until the learner tries (Practice's existing "hide every
hint" branch); a `screen.ts` cue state holds the tries with Retry, Show the move and Skip, judged by
`labelMove` alone (not `src/review/retry.ts`, which is tied to a finished game); Act III plays back
through the lesson opponent; a haptic tick marks the cue in Explore. Wide layout, and the phone
layout on the redesign's two panes: three act rows on the left, one line and three icon buttons on
the right. Waits on the phone redesign's panes. Starts with a design review of whether the cue is a
third mode-like state in `screen.ts`, and records its outcome here before building. The starting
proposal: a try is a board preview until it passes, then a move through `useGame` (the screen
reducer does not own the game); Act III reuses peek's playback, which does not move the game; the
three acts replace the trap card for a marked line, so landing stays the one trigger.

### Piece F: Practice and marks

The Practice opponent steers into each opportunity that is a line to pass until it is passed
(`steering` in `marks.ts`, the walk in `cleanRun.ts`); seen and passed marks reuse the progress
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
unknown, never as 0 or as enough games. Then it writes the marked move with its cost, and the
accepted replies and Act III as Rules say. Popularity, which runs after it, must not drop counts it
did not remeasure (today it drops them wherever it did not ask, such as positions with one guide
move), and where it does remeasure it writes the position total from that same answer. Stafford
only, with B's floors. Its PR lists which rows changed fold (rare) or counted status once the totals
change shares. Merges after E and F, because new lines change what the Practice opponent plays.

### Piece D2: Names and notes

The explain step writes each marker's `name` and one short note per Act III move of the punishing
side, under its current guards; answers in `answers/<id>-explain.jsonl`. An audit sample is graded
before it lands.

### Piece D3: Rollout

The step runs on every lesson; `--no-model` rebuilds each exactly. The PR lists, per lesson, which
rows changed fold or counted status. Cap finds per lesson by score if the files grow too much for
phones (the Caro-Kann file is already 5.3 MB).

### Piece G: List page

Opportunities for the lesson and the band, ranked by score, each row with reach, how often and
payoff meters and the passed mark; tapping a row plays Act I and hands over the board at the cue. A
section in the wide panel; on phones the pager's leftmost page (opportunities, lesson, scoresheet),
holding the list and the finder's "from this position" button and source chip. The band is the
opponent setting's, by `opponentBand` in `src/lesson/select.ts` as Practice picks it. Waits on the
redesign's pager and on D1.

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
extracts the legal-move walk from `bestMove` in `src/maia/maia.ts` into a shared helper that yields
each legal move with its policy slot, rebuilds `bestMove` on it, and exports the private `softmax`
from `src/maia/network.ts` to apply to those slots' scores only. The shares form a host source
labeled `maia` for a whole run. Checks first how close they come to lichess's at the same rating.
Maia finds are labeled estimates and listed after lichess ones, never ranked together.

### Piece K: Finder in the app

The core run from any position, derived from the store and memoized on the answers it reads (engine
answers through `useAnalysis`, replies through I or J), with finds joining the list page as they are
confirmed and each number's source labeled. The finder's searches use the existing Stockfish watch
and queue behind whatever the board is watching: they never become the newest request (the engine
searches the newest position first) while the board shows a position, or `decide` would stop the
bar's and the lesson's searches. Measures first how long the first find takes on a phone, with
lichess's pacing (one request every 2.5 s) and with Maia. After A, G, I and J.

### Piece L: Saved finds

A bookmark saves a find on the device as the same lesson fragment the importer writes (the line, the
marked move, the cue's replies and Act III), under its own storage key with its own versioned parser
(Shape; unknown versions are ignored), so it plays back through E's code. `/privacy` and the Play
listing's Data safety answers updated for the new stored value. After K and E.
