# Opportunities

An opportunity is a position where a real opponent is likely to play a bad move, and the way to
punish it is not obvious. Opening Night finds them from lichess game counts and Stockfish, and
teaches each one in three acts by letting the learner play it. Example, from the Stafford Gambit at
the 1400 band: 36% of White players reach 5.d3 Bc5 (Act I, the setup); 15% of them then play 6.Bg5,
which gives away 43% of White's winning chances, and Black answers 6...Nxe4 (Act II, "Your cue.");
7.Bxd8 Bxf2+ 8.Ke2 Bg4# follows (Act III, the payoff).

Product plan with mockups: [product plan](https://claude.ai/artifact/Bun3eWNJZdbhDW2iAv9vAZ).
Technical plan and its adversarial review:
[technical plan](https://claude.ai/artifact/W7ri91SoRGYDqHcowjnz33). This file restates both as
built; where they differ, this file wins. Each piece's section holds the rules it builds, so the
plan doesn't depend on those links.

## Decisions (Nathaniel, 2026-11-22 to 2026-11-24)

- Real lichess counts per rating band are the source of "how often". Maia is only the fallback: in
  the app when no lichess account is connected, or where lichess has too few games.
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
  too few games) Maia on the device. Each number says which source it came from.
- In Practice, an opportunity whose mistake is played 10% or more over all bands is a line to pass,
  and the opponent steers into it until it is passed. Inside one, the opponent also walks every
  reply played 10% or more. A dice mode (real rates) and guides extended to every common reply are
  future ideas, not started.
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

- Derived, one pure function each in `src/opportunity/`: a move's share (its games over the
  position's), reach (shares of the erring side's moves multiplied along the path), found rate (the
  punishing move's games over the cue position's), score, role (trap or opportunity, from the
  learner's side), the current act, whether a position is a cue, and whether an opportunity is a
  line to pass. No component recomputes them.
- App state the whole feature adds: saved finds (their own versioned store) and the lichess
  connection (a setting). The finder has none of its own: engine answers and lichess replies live in
  the Data Client store keyed by their request, and the finds and the next request are computed
  from them each render.
- Flow: lesson file or network, into the store, through the pure functions, through `guidance.ts`
  (the only place anything is hidden), into components. Components send events to reducers and
  never write derived values back.
- A score never mixes sources: one host-chosen source answers a whole finder run, and its finds
  carry that source's name.
- Pieces E, G, I and K must be checked on Android (touch, the haptic tick, the pager, the sign-in
  redirect, on-device search).
- Code says `opportunity`, `trap` and `mistake`, never `slip` (`practice.ts` uses that for a
  learner's non-book move).

## Rules

The numbers here are starting values, tuned at piece B's gate.

- **Score** of an opportunity for a band: reach × share × cost. Ties: the lower found rate ranks
  first, since teaching pays most where players miss the punishment.
- **Cost**: the expected score the erring side gives away beside its best move, by `judgement` in
  `src/analysis/quality.ts`. The floor is that module's mistake limit (0.10), so every
  opportunity's first move labels as a mistake or a blunder. A stored cost only ranks; screens show
  the live verdict.
- **Share floor**: a reply played in under 5% of the games at its position (in the band) is not
  screened; the same 5% as `RARE_SHARE` in `src/lesson/select.ts`, which folds such rows away.
  **Minimum games**: a position fewer than 100 games reach (in the band) is too thin to judge.
- **Line to pass**: an opportunity whose mistake `countedReplies` counts (`src/lesson/cleanRun.ts`:
  10% over all bands, or the most played reply). Other finds show in the list and the finder but
  are never required. A marked move without counts never counts toward passing.
- **The cue's accepted replies**: the punishing side's moves in the cue position's final analysis
  that label best or good beside its first line and keep at least the cost floor of the gain. The
  importer writes each as a book move, and Act III's moves too, so a clean run can play them.
- **Act III** follows the punishing side's best move and the erring side's most played reply (else
  Stockfish's), and ends at mate, when the punishing side is three points of material up and
  winning, when its second-best move is also winning, or after six of its moves.
- **Sketch and full**: a sketch is a search that reached at least `SKETCH_DEPTH`
  (`src/review/order.ts`); full is the app's search (`APP_SEARCH`). Sketches screen replies; only
  full searches confirm a find or set a stored cost. Analyses stay keyed as the store keys them.

## Pieces

### Piece A: Finder core

`src/opportunity/`, pure like `src/review/`: no React, lichess, Stockfish builds or file access.
Tests use hand-made fixture answers, including the Stafford 6.Bg5 find.

- One function of the answers known so far, like the review's `nextSearch`: it takes the start
  line, the side looking for opportunities, the band, the limits, and lookups for the replies
  (counts per move), analyses (sketch or final) and the punishing side's own moves (a lesson's book
  moves, where it has some) that the host has so far. It returns the finds so far and the requests
  still missing, most useful first: a position's replies, a sketch, or a full search, each naming
  its line and position. The script loops over it; the app derives it each render. No async
  generator and no queue.
- The walk is best-first by reach from the start (reach 1). At the erring side's turn it screens
  every reply over the share floor with a sketch, confirms each reply at or over the cost floor with
  full searches, then asks for the cue position's replies (found rate) and builds Act III. Replies
  under the cost floor continue the walk. At the punishing side's turn it follows the given moves,
  else Stockfish's best. It stops below a reach floor, past a ply cap, or at a thin position. One
  find per cue position; a position reached again adds nothing.
- All its floors and caps are named constants in `src/opportunity/limits.ts`, tuned at piece B's
  gate: the Rules' numbers, a reach floor (1%) and a ply cap (24 plies past where the finder opens).

### Piece B: Report script

A script that runs the core over the Stafford lesson only, with the importer's lichess explorer
(`lichessExplorer`, `scripts/import-study/popularity.ts`) and Node Stockfish, and writes a ranked
report to the project files. It changes no lesson file. Its answers go in its own files,
`scripts/import-study/answers/<id>-opportunities-*.jsonl`, which no other step reads or prunes (as
`coverOpponent.ts` keeps its own); commit them.

Gate: Nathaniel reads the top 20 finds and sets the floors before any lesson file changes.

### Piece C: Lesson data

- Format: `LessonPosition.games` (games reaching the position, per band of
  `Lesson.popularity.ratingBands`; absent means not measured) and `LessonMove.mistake`
  (`{ cost?, name?, verdict? }`: cost as above, absent until the importer measures it; `name` a short
  title for the list; `verdict` the `Trap` verdict it replaces). All optional, so the format number
  stays 3.
- The `Trap` idea goes. Each existing trap (57 on positions, 82 in move notes) becomes guide-tree
  moves with the marker on its first move. A note whose only drawn idea was the trap moves to the
  marked move; a note with other ideas keeps them and its text where it was. Positions reached
  through a marked move of the learner's side are outside the book, so a clean run never reaches
  them and the checker needs no book move there.
- The app reads the new shape. The trap card, its playback and landing (`LandedTrap`) behave as
  before, except for the "show traps" scope in Decisions (before, it hid every trap).
- Checker rules for marked moves (legal; `cost` at or over the floor when present). README for
  `assets/lessons/` and `AGENTS.md` updated.
- No new finds: shipped lessons change only by the migration, rebuilt by the importer from
  committed answers.

### Piece E: Cue and three acts

In Explore, after the erring side plays a marked move into a cue, `guidance.ts` hides the
candidates, Stockfish's best and verdicts until the learner tries (Practice's existing "hide every
hint" branch); a `screen.ts` cue state holds the tries with Retry, Show the move and Skip, judged
by `labelMove` alone (not `src/review/retry.ts`, which is tied to a finished game); Act III plays
back through the lesson opponent; a haptic tick marks the cue in Explore. Wide layout, and the phone
layout on the redesign's two panes: three act rows on the left, one line and three icon buttons on
the right. Waits on the phone redesign's panes. Starts with a design review of whether the cue is a
third mode-like state in `screen.ts`.

### Piece F: Practice and marks

The Practice opponent steers into each opportunity that is a line to pass until it is passed
(`steering` in `marks.ts`, the walk in `cleanRun.ts`); seen and passed marks reuse the progress
store. After E.

### Piece H: Reply-row marks

A red dot and the live cost on a marked move's row in the reply list, in Explore only. After F,
since E, F and H all touch `guidance.ts`, `screen.ts` and the candidate list.

### Piece D1: Importer step on Stafford

An opportunities step in `scripts/import-study`, before the explain step (popularity stays last),
fed by piece B's answers files and the explorer directly: it asks the explorer about every position
on a find's path, writes `LessonPosition.games`, the marked move with its counts and cost, the
cue's accepted replies and Act III as book moves. Stafford only, with B's floors. Merges after E and
F, because new lines change what the Practice opponent plays.

### Piece D2: Names and notes

The explain step writes each marker's `name` and one short note per Act III move of the punishing
side, under its current guards; answers in `answers/<id>-explain.jsonl`. An audit sample is graded
before it lands.

### Piece D3: Rollout

The step runs on every lesson; `--no-model` rebuilds each exactly. Cap finds per lesson by score
if the files grow too much for phones (the Caro-Kann file is already 4.7 MB).

### Piece G: List page

Opportunities for the lesson and the band, ranked by score, each row with reach, how often and
payoff meters and the passed mark; tapping a row plays Act I and hands over the board at the cue.
A section in the wide panel; on phones the pager's leftmost page (opportunities, lesson,
scoresheet), holding the list and the finder's "from this position" button and source chip. The
band is the opponent setting. Waits on the redesign's pager and on D1.

### Piece I: lichess connection

Sign in with lichess from the settings sheet (OAuth for apps without a server), the token kept on
the device, and a Data Client endpoint for the explorer with the importer's pacing (one request
every 2.5 s) and castling conversion. Starts with a spike: may a browser page and the Android app
call the explorer with a user's token, and does the sign-in redirect work on GitHub Pages and
Android. If not: Maia only in the app, real counts only in shipped lessons. `/privacy` and the
Play listing's Data safety answers updated.

### Piece J: Maia shares

Reply shares from Maia's move scores for the legal moves (the network already scores every move),
as a replies source labeled `maia`. Checks first how close they come to lichess's at the same
rating; if far, Maia finds are labeled estimates and rank below lichess ones.

### Piece K: Finder in the app

The core run from any position, derived each render from the store (engine answers through
`useAnalysis`, replies through I or J), with finds joining the list page as they are confirmed and
each number's source labeled. Measures first how long the first find takes on a phone, with
lichess's pacing (one request every 2.5 s) and with Maia. After A, G, I and J.

### Piece L: Saved finds

A bookmark saves a find on the device as the same lesson fragment the importer writes (the line,
the marked move, the cue's replies and Act III), in its own versioned store (`SavedProgress` drops
shapes it doesn't know), so it plays back through E's code. `/privacy` and the Play listing's Data
safety answers updated for the new stored value. After K and E.
