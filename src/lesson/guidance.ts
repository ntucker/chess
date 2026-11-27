/**
 * What the lesson screen shows, from the facts (./view.ts), the mode and the
 * learner's switches: the only place that decides what is hidden.
 *
 * - Explore shows every note on the idea card. The board draws the
 *   candidates, and a note's ideas only when the learner points at it (but
 *   see "Arrows" below), since both would share the board's
 *   colors; a previewed move draws its own ideas, and where no candidates
 *   are listed every note's ideas are.
 *   Only a note about the position on the board can be pointed at, and
 *   Stockfish's best move shows only while nothing is previewed, pointed at
 *   or playing back. Past the guide's moves, Stockfish's top three are
 *   listed in the candidates' place, and preview and play as they do; the
 *   resting board marks only the first, as the best move, with no arrows
 *   for the other two. Inside the guide, on the opponent's turn, Stockfish's
 *   best is listed after the candidates when it isn't one of them, so the
 *   learner can practice the strongest reply beside the guide's
 *   (`listedEngineMoves`).
 * - Practice hides every hint while it is the learner's turn: no candidates,
 *   previews, best move or top moves, and of the notes only those of the move
 *   just played, and a trap's warning while traps are shown. Right after the
 *   learner's move the card shows what it was for: the move's notes, then
 *   those of the position it was played in, which can't be pointed at. On
 *   the opponent's turn it shows the opponent's candidates, and their
 *   previews, only with auto play off, since the learner has to pick one;
 *   with auto play the opponent just plays. Stockfish's moves stay hidden.
 *   Where the moves pick the opening (`picking`: the start, and the moves
 *   lessons share), nobody replies, so their candidates and previews show
 *   in every mode.
 * - "Arrows" off keeps the candidates' arrows and Stockfish's
 *   best off the resting board in Explore, so the next moves show only once
 *   the learner points at a row or drags a piece; the list still shows them.
 *   The board draws the ideas of the move just played in their place.
 *   Practice ignores it (`movesSwitchApplies`) and draws the arrows of the
 *   few choices it lists (the opening's pick, the opponent's reply with auto
 *   play off).
 * - Traps: with "show traps" on, a trap's sequence is drawn before the
 *   learner commits, beside the candidates; off, it isn't. A trap fallen
 *   into is shown either way, and plays back, through the trap's moves and
 *   the learner's turn after them; a move off its sequence, by either side,
 *   ends it at once. With traps hidden, no note that holds a trap shows in
 *   Practice, on any turn.
 * - A cue (src/opportunity/cue.ts: the other side's marked mistake) hides
 *   nothing and tests nothing of its own: the mode does. Explore shows its
 *   three acts beside every hint, from the cue along the line's moves the
 *   game plays (`cueActs`). In Practice the cue is an ordinary learner
 *   turn, named by nothing before the move; after it, the cue shows found
 *   or missed (`Guidance.opportunity`), as a trap fallen into shows its
 *   card. Where either shows, the mistake's trap shows its note with it
 *   rather than on its own card (`trapIn`).
 * - While a note's idea plays back, the board is the playback's: nothing else
 *   is drawn, and the preview it started from stays.
 * - While a piece is dragged, or selected by a click, the board draws only
 *   its candidates, rare ones and Stockfish's top moves too. A drag draws
 *   them wherever the piece is over, so dragging across the board moves
 *   nothing else on it; the idea card shows the move under it. A click hides
 *   the resting best-move mark the same way, until the piece is unselected.
 * - After a mistake or blunder of the learner's side, the reply that punishes
 *   it (`refutation` in src/analysis/quality.ts) is marked while nothing is
 *   previewed, pointed at, picked up or playing back, in every mode and with
 *   "Arrows" on or off, since it judges the move just played.
 *   Never on the learner's turn: there it would be their own next move,
 *   drawn in the color of what goes wrong. Where the best move or a candidate
 *   is the same move, the refutation's arrow is drawn instead of theirs. Its
 *   being a rare reply doesn't hide it: it still punishes.
 * - In Explore, each guide candidate carries Stockfish's verdict on it
 *   (`Guidance.verdicts`), the book move too, so the learner can tell a
 *   popular move from a good one. Practice keeps it hidden like every
 *   engine hint, and where the moves pick the opening there is none.
 * - Rare candidates (`Candidate.rare`) are left off the list, which shows
 *   them only when asked, and off the board's arrows; Stockfish's best isn't
 *   tagged on one either. Only a preview of one, or dragging its piece,
 *   draws it.
 *
 * guidance stays in lesson terms; lessonDrawings (./drawings.ts) turns it
 * into board shapes, and says which ideas draw nothing (`drawsOnBoard`).
 */
import type { EngineVerdict } from '@/analysis/quality';
import { type Acts, type Cue, payoffAt } from '@/opportunity/cue';
import type { Settings } from '@/settings/settings';

import { drawsOnBoard } from './drawings';
import type { PositionKey, Uci } from './lesson';
import type { BoardIdea, BoardNote } from './mistakes';
import { type Candidate, mainCandidate } from './select';
import { type LandedTrap, type LessonView, type Preview, type ShownNote, shownKey } from './view';

export type LessonMode = 'explore' | 'practice';

/** The learner's switches on the lesson screen. */
export type LessonSwitches = Pick<Settings, 'auto' | 'showMoves' | 'showTraps'>;

/** Stockfish's view of the shown position, as far as it has arrived. */
export interface EngineView {
  /** Its first line's move: the best. */
  readonly best?: Uci;
  /** Its top three moves, best first, as rows (`engineCandidates`). */
  readonly top?: readonly Candidate[];
  /** Its search has finished, so `best` won't change. */
  readonly final?: boolean;
  /** Its verdict on each guide candidate it has judged, by move (`engineVerdict`). */
  readonly verdicts?: ReadonlyMap<Uci, EngineVerdict>;
}

export interface GuidanceInput {
  readonly view: LessonView;
  readonly mode: LessonMode;
  readonly switches: LessonSwitches;
  /**
   * The line is among the moves the lessons share, where its moves pick the
   * opening (`isPicking` in ./openings.ts): the start, at least.
   */
  readonly picking: boolean;
  /** The move the learner's pointer previews (`preview` in ./view.ts). */
  readonly preview?: Preview;
  /**
   * The square of the piece the learner holds: dragged, or selected by a
   * click. The board draws that piece's own moves, and no resting best-move mark.
   */
  readonly lifted?: Candidate['from'];
  /** The note the learner points at on the idea card. */
  readonly pointed?: BoardNote;
  /** The note whose idea plays back on the board. */
  readonly playing?: BoardNote;
  readonly engine?: EngineView;
  /**
   * The reply that punishes the move into the shown position, if one clearly
   * does, whoever played it.
   */
  readonly refutation?: Uci;
}

/** An idea to draw, and the position it is checked in. */
export interface ShownIdea {
  readonly idea: BoardIdea;
  readonly at: PositionKey;
}

/** The ideas that play back: a plan's routes, a line's or trap's moves. */
export type PlayedBack = Extract<BoardIdea, { type: 'plan' | 'line' | 'trap' }>;

/** An idea shown that plays back. */
export type ShownPlayback = ShownIdea & { readonly idea: PlayedBack };

export interface Guidance {
  /** The candidate list. */
  readonly candidates: readonly Candidate[];
  /** The rare candidates, which the list shows only when asked. */
  readonly rare: readonly Candidate[];
  /** The candidate to look at first (`mainCandidate`), drawn and listed as the main one. */
  readonly main?: Candidate;
  readonly preview?: Preview;
  /** The idea card's notes: the preview's while a move is previewed. */
  readonly notes: readonly ShownNote[];
  /**
   * Of those notes, the ones the learner can point at: those about the
   * position on the board (`shownKey`) whose ideas draw.
   */
  readonly pointable: readonly BoardNote[];
  /** The ideas of those notes the switches allow: what can be drawn or played back. */
  readonly ideas: readonly ShownIdea[];
  /** Of `ideas`, those the board draws now; of several plans on one position, only the first. */
  readonly drawn: readonly ShownIdea[];
  /** The candidates whose arrows the board draws now. */
  readonly drawnCandidates: readonly Candidate[];
  /** The ideas that can play back: those of `ideas` that play back, and a trap fallen into. */
  readonly playable: readonly ShownPlayback[];
  /** The idea playing back, once its note's playback has started. */
  readonly playing?: ShownPlayback;
  /**
   * The note pointed at whose ideas the board draws: one of `pointable`, and
   * none while an idea plays back.
   */
  readonly pointed?: BoardNote;
  /**
   * Stockfish's best move to mark, with "Arrows" on, while nothing
   * is previewed, pointed at or playing back, when `tagsBest` says so.
   * Past the guide's moves it is the first of `top`: both come from one analysis.
   */
  readonly best?: Uci;
  /** Stockfish's rows the list shows (`listedEngineMoves`). */
  readonly top: readonly Candidate[];
  /**
   * Stockfish's verdict on each candidate, by move, where the list shows
   * verdicts: in Explore, away from the moves that pick the opening. A
   * candidate missing from it is still being judged. Undefined elsewhere.
   */
  readonly verdicts?: ReadonlyMap<Uci, EngineVerdict>;
  /**
   * The candidates the list and the board point out as opportunities (a red
   * dot, and the cost from `verdicts`): the other side's marked mistakes, in
   * Explore away from the moves that pick the opening. Empty elsewhere.
   */
  readonly opportunities: ReadonlySet<Uci>;
  /** The reply that punishes the move just played, where guidance marks it. */
  readonly refutation?: Uci;
  /** A trap the line fell into, while it shows (see `trapShown`). */
  readonly trap?: LandedTrap;
  /**
   * Where `trap`'s note shows: on its own card, or with the cue that teaches
   * it (`acts` or `opportunity`).
   */
  readonly trapIn?: 'card' | 'cue';
  /** The acts of the cue the board is in, in Explore (`cueActs`). */
  readonly acts?: Acts;
  /**
   * In Practice, the cue the learner just answered, found or missed
   * (`Cue.found`), while it shows as news of that move (`answerShown`).
   */
  readonly opportunity?: Cue;
  /** The line has reached a guide line's end, and the headline tells it (see `newsShown`). */
  readonly lineEnded: boolean;
}

const NO_VERDICTS: ReadonlyMap<Uci, EngineVerdict> = new Map();
const NO_OPPORTUNITIES: ReadonlySet<Uci> = new Set();

/** Whether "Arrows" changes anything in `mode`: only in Explore. */
export const movesSwitchApplies = (mode: LessonMode) => mode === 'explore';

/**
 * Whether the lesson's list of opportunities shows: in Explore, which
 * reveals, since each row names a mistake Practice tests the learner on.
 */
export const listsOpportunities = (mode: LessonMode) => mode === 'explore';

/** Whether Stockfish's top moves are listed: in Explore, past the guide's moves. */
export const listsTopMoves = (view: LessonView, mode: LessonMode) =>
  mode === 'explore' && view.place !== 'inside';

/** How far Stockfish has got with where a candidate leads, for `verdictSearch`. */
export type Searched = 'none' | 'started' | 'final' | 'failed';

/**
 * The listed candidate to search where it leads next, for its verdict: one
 * the board's analysis doesn't judge (`Guidance.verdicts`), once the
 * board's own searches are done (`ready`: its analysis final, its move
 * labelled or that label's search given up), since the engine runs the
 * newest search asked for. One search at a time: a search already started
 * runs on, so pointing at row after row
 * doesn't keep restarting them; then the row pointed at, even one whose
 * search gave up (pointing tries it again); then the first not searched.
 */
export function verdictSearch(
  shown: Guidance,
  rareShown: boolean,
  ready: boolean | undefined,
  searchOf: (uci: Uci) => Searched,
): Uci | undefined {
  const { verdicts } = shown;
  if (!ready || !verdicts) return undefined;
  const waiting = [...shown.candidates, ...(rareShown ? shown.rare : [])]
    .map(({ move }) => move.uci)
    .filter((uci) => !verdicts.has(uci) && searchOf(uci) !== 'final');
  const pointed = shown.preview?.candidate.move.uci;
  return (
    waiting.find((uci) => searchOf(uci) === 'started') ??
    waiting.find((uci) => uci === pointed) ??
    waiting.find((uci) => searchOf(uci) === 'none')
  );
}

/**
 * Whether Stockfish's best move `uci` is tagged as the best: past the guide's
 * moves as soon as it arrives; inside them, where the candidates are what is
 * highlighted, only when it isn't one of them (rare ones included), and only
 * once its search is final: in about a quarter of lesson positions an earlier
 * depth names a move outside the guide that the final one doesn't.
 */
const tagsBest = (view: LessonView, final: boolean | undefined, uci: Uci) =>
  view.place !== 'inside' || (final === true && !isCandidate(view, uci));

/**
 * Stockfish's rows the list shows, from its top three (`EngineView.top`), in
 * Explore: past the guide's moves all three, in the
 * candidates' place (`listsTopMoves`); inside, on the opponent's turn, its
 * best after the candidates, when the board tags it (`tagsBest`). The
 * guide's reply often teaches a trick, so the learner can practice both it
 * and the strongest reply. Example: in the Urusov Gambit,
 * after 1.e4 e5 2.Bc4 Nf6 3.d4 exd4 4.Nf3, the guide lists only 4...Nxe4 and
 * Stockfish's 4...Bb4+ is listed after it. Where the moves pick the opening
 * the rows are openings, so none is added.
 */
export function listedEngineMoves(
  view: LessonView,
  mode: LessonMode,
  picking: boolean,
  top: readonly Candidate[],
  final: boolean | undefined,
): readonly Candidate[] {
  if (listsTopMoves(view, mode)) return top;
  const best = top.at(0);
  const listsBest =
    mode === 'explore' &&
    !picking &&
    !view.learnerToMove &&
    best !== undefined &&
    tagsBest(view, final, best.move.uci);
  return listsBest ? [best] : [];
}

/** A list's rows, in order: the guide's, Stockfish's best after them, then the rare ones while shown. */
export const shownRows = ({
  candidates,
  engineBest,
  rare,
  rareShown,
}: {
  readonly candidates: readonly Candidate[];
  readonly engineBest?: Candidate;
  readonly rare: readonly Candidate[];
  readonly rareShown: boolean;
}) => [...candidates, ...(engineBest ? [engineBest] : []), ...(rareShown ? rare : [])];

export function guidance(input: GuidanceInput): Guidance {
  const {
    view,
    mode,
    switches,
    picking,
    preview: pointerPreview,
    lifted: pointerLifted,
    pointed,
    playing: playingNote,
    engine,
  } = input;
  const explore = mode === 'explore';
  const movesShown = switches.showMoves || !movesSwitchApplies(mode);
  // Where the moves pick the opening they are a choice, not a quiz.
  const choices = explore || picking || (!view.learnerToMove && !switches.auto);
  const preview = choices ? pointerPreview : undefined;
  const lifted = choices ? pointerLifted : undefined;
  // In Practice a previewed reply leads to the learner's move, so its notes
  // are kept as on the learner's turn. Explore shows every note.
  const notes = preview
    ? preview.notes.filter((shown) => explore || beforeMove(shown, switches.showTraps))
    : restingNotes(view, explore, switches.showTraps);
  const allowed = (idea: BoardIdea) => !isLearnerTrap(idea) || switches.showTraps;
  const ideas = notes.flatMap((shown) => noteIdeas(shown, allowed));
  const moveIdeas = new Set(
    notes.flatMap(({ note, before }) => (before === undefined ? [] : (note.ideas ?? []))),
  );
  const withRare = choices ? view.candidates : [];
  const candidates = withRare.filter(({ rare }) => !rare);
  const trap = view.trap && trapShown(view, view.trap) ? view.trap : undefined;
  const playable = [
    ...ideas.filter(playsBack),
    ...(trap ? [{ idea: trap.trap, at: trap.note.after }] : []),
  ];
  const playing = playingNote && notePlayback(playable, playingNote);
  // A note with nothing to draw on the board's position leaves the board as it
  // is: a text note, or one about another position (the one a move was played in).
  const pointable = notes
    .filter(({ after }) => after === shownKey(view.key, preview))
    .filter(({ note }) => note.ideas?.some((idea) => drawsOnBoard(idea) && allowed(idea)))
    .map(({ note }) => note);
  const pointedNote = !playing && pointed && pointable.includes(pointed) ? pointed : undefined;
  const top = listedEngineMoves(view, mode, picking, engine?.top ?? [], engine?.final);
  const board = boardShown({
    candidates,
    liftable: [...withRare, ...top],
    preview,
    lifted,
    ideas,
    playing,
    pointed: pointedNote,
    showMoves: movesShown,
    moveIdeas,
  });
  // The board at rest: nothing previewed, picked up, pointed at or playing back.
  const resting = !preview && !lifted && !playing && !pointedNote;
  // Only after a move of the learner's side: on their turn it would be their
  // own next move, drawn in the color of what goes wrong.
  const refutation = resting && !view.learnerToMove ? input.refutation : undefined;
  // Where the list judges its moves: Stockfish's verdicts, and the opportunities.
  const judged = explore && !picking;
  const best =
    explore && movesShown && resting && engine?.best !== refutation ? engine?.best : undefined;

  const acts = cueActs(view, mode, picking);
  const opportunity =
    mode === 'practice' && !picking && view.cue && answerShown(view, view.cue)
      ? view.cue
      : undefined;
  // The cue's own mistake: the cue comes right after it.
  const shownCue = acts?.cue ?? opportunity;
  const withCue = trap !== undefined && shownCue?.ply === trap.ply + 1;
  return {
    candidates,
    rare: withRare.filter(({ rare }) => rare),
    main: mainCandidate(candidates),
    preview,
    notes,
    pointable,
    ideas,
    drawn: firstPlanOnly(board.drawn),
    drawnCandidates: board.candidates.filter(({ move }) => move.uci !== refutation),
    playable,
    playing,
    pointed: pointedNote,
    best: best && tagsBest(view, engine?.final, best) ? best : undefined,
    top,
    verdicts: judged ? (engine?.verdicts ?? NO_VERDICTS) : undefined,
    opportunities:
      judged && !view.learnerToMove
        ? new Set(view.candidates.filter(({ move }) => move.mistake).map(({ move }) => move.uci))
        : NO_OPPORTUNITIES,
    refutation,
    trap,
    trapIn: trap && (withCue ? 'cue' : 'card'),
    acts,
    opportunity,
    lineEnded: view.lineEnd !== undefined && newsShown(view, view.lineEnd),
  };
}

const isCandidate = (view: LessonView, uci: Uci | undefined) =>
  view.candidates.some(({ move }) => move.uci === uci);

/**
 * What the board draws: nothing while a note plays back; a pointed note's
 * ideas alone; a sliding preview's ideas; a picked-up piece's moves alone
 * (`liftable`: dragged or selected); or else the listed candidates with only
 * traps beside them (every idea where none are listed); with `showMoves`
 * off, the traps and the ideas of the move just played instead.
 */
function boardShown({
  candidates,
  liftable,
  preview,
  lifted,
  ideas,
  playing,
  pointed,
  showMoves,
  moveIdeas,
}: {
  readonly candidates: readonly Candidate[];
  /** Every move a dragged or selected piece lights: rare candidates and top moves too. */
  readonly liftable: readonly Candidate[];
  readonly preview?: Preview;
  /** The square of the piece in hand: a drag, or a piece selected by a click. */
  readonly lifted?: Candidate['from'];
  readonly ideas: readonly ShownIdea[];
  readonly playing?: ShownPlayback;
  readonly pointed?: BoardNote;
  readonly showMoves: boolean;
  /** The ideas of the notes on the move just played. */
  readonly moveIdeas: ReadonlySet<BoardIdea>;
}): { readonly candidates: readonly Candidate[]; readonly drawn: readonly ShownIdea[] } {
  if (playing) return { candidates: [], drawn: [] };
  if (pointed) {
    return { candidates: [], drawn: ideas.filter(({ idea }) => pointed.ideas?.includes(idea)) };
  }
  if (preview?.slide) return { candidates: [], drawn: ideas };
  if (lifted) return { candidates: liftable.filter(({ from }) => from === lifted), drawn: [] };
  if (!candidates.length) return { candidates, drawn: ideas };
  if (showMoves) return { candidates, drawn: ideas.filter(({ idea }) => idea.type === 'trap') };
  return {
    candidates: [],
    drawn: ideas.filter(({ idea }) => idea.type === 'trap' || moveIdeas.has(idea)),
  };
}

/** The idea card's notes when no move is previewed. */
function restingNotes(
  view: LessonView,
  explore: boolean,
  showTraps: boolean,
): readonly ShownNote[] {
  if (explore) return view.notes;
  // The position's own notes would hint at the move. A trap's warning, on
  // the position or on the move into it, shows only with traps shown.
  if (view.learnerToMove) return view.notes.filter((shown) => beforeMove(shown, showTraps));
  // Right after the learner's move: what it was for, now that it's played.
  // With traps hidden, no note holding a trap shows, on any position or
  // move, so the learner can still fall in; a trap fallen into shows through
  // `trap` instead, on its own card.
  const played = view.notes.filter(({ before }) => before !== undefined);
  const own = view.notes.filter(({ before }) => before === undefined);
  return [...played, ...view.playedFrom, ...own].filter(({ note }) => showTraps || !hasTrap(note));
}

/** A trap the learner's side can fall into: what "show traps" off hides (an opportunity stays shown). */
const isLearnerTrap = (idea: BoardIdea) => idea.type === 'trap' && idea.learnerFalls;

const hasTrap = (note: BoardNote) => note.ideas?.some(isLearnerTrap) ?? false;

/**
 * Whether a note shows in Practice before the learner moves: the move into
 * the position, not the position's own notes, which would hint at the move;
 * a trap's warning only with traps shown.
 */
const beforeMove = ({ note, before }: ShownNote, showTraps: boolean) =>
  hasTrap(note) ? showTraps : before !== undefined;

/**
 * Whether news that comes with the line's move `ply` (a trap's last move, a
 * guide line's end) still shows: up to that move, and at the learner's turn
 * right after it, so an opponent's reply with auto play on doesn't take it
 * away before the learner reads it.
 */
function newsShown(view: LessonView, ply: number): boolean {
  const movesAfter = view.ply - ply;
  return movesAfter <= 0 || (movesAfter === 1 && view.learnerToMove);
}

/**
 * Whether a trap's card still shows: as news of its last move the line plays.
 * A move off its sequence, by either side, takes the card away at once: the
 * learner's turn after it is no longer the trap's.
 */
function trapShown(view: LessonView, { ply, movesPlayed, trap }: LandedTrap): boolean {
  return alongLine(view, ply + movesPlayed, movesPlayed === trap.moves.length);
}

/**
 * Whether a story told along a line still shows: through `last`, the last of
 * the line's moves the game plays, and, where the story `ends` there, as that
 * move's news (`newsShown`).
 */
const alongLine = (view: LessonView, last: number, ends: boolean): boolean =>
  view.ply <= last || (ends && newsShown(view, last));

/**
 * The acts of the cue the board is in, in Explore away from the moves that
 * pick the opening: from the cue to the last move the game plays along its
 * line, and, once the whole line is played, as its news (`newsShown`). A
 * move off the line ends them at once, as it ends a trap's card.
 */
export function cueActs(view: LessonView, mode: LessonMode, picking: boolean): Acts | undefined {
  const { cue } = view;
  if (!cue || mode !== 'explore' || picking || view.ply < cue.ply) return undefined;
  const shown = alongLine(view, cue.ply - 1 + cue.followed, cue.followed === cue.line.length);
  return shown ? { cue, replied: view.ply > cue.ply, payoff: payoffAt(cue, view.ply) } : undefined;
}

/**
 * Whether the learner's answer to `cue` still shows: from that move along
 * the line's moves the game plays, and as news of the last of them where it
 * ends the answer's story: the whole line played, or a move off it by either
 * side, so a find reads as long as a miss.
 */
function answerShown(view: LessonView, cue: Cue): boolean {
  if (cue.tried === undefined || view.ply <= cue.ply) return false;
  const last = cue.ply - 1 + Math.max(cue.followed, 2);
  // The game plays a move past the line's moves it follows: off the line.
  const left = view.keys.length > cue.ply + cue.followed;
  return alongLine(view, last, left || cue.followed === cue.line.length);
}

/** `shown`'s ideas that `allowed` lets through, each with the position it is checked in. */
const noteIdeas = (shown: ShownNote, allowed: (idea: BoardIdea) => boolean): ShownIdea[] =>
  (shown.note.ideas ?? []).filter(allowed).map((idea) => ({ idea, at: shown.after }));

/**
 * One plan at a time on each position: two plans' numbered routes would read
 * as one sequence. A plan on another position doesn't hide this one's.
 */
function firstPlanOnly(ideas: readonly ShownIdea[]): readonly ShownIdea[] {
  const firstPlan = (at: PositionKey) =>
    ideas.find((shown) => shown.idea.type === 'plan' && shown.at === at);
  return ideas.filter((shown) => shown.idea.type !== 'plan' || shown === firstPlan(shown.at));
}

const playsBack = (shown: ShownIdea): shown is ShownPlayback =>
  shown.idea.type === 'plan' || shown.idea.type === 'line' || shown.idea.type === 'trap';

/** The idea of `note` among `playable` (see `Guidance.playable`), or undefined. */
export function notePlayback(
  playable: readonly ShownPlayback[],
  note: BoardNote,
): ShownPlayback | undefined {
  return playable.find(({ idea }) => note.ideas?.includes(idea));
}
