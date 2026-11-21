/**
 * What the lesson screen shows, from the facts (./view.ts), the mode and the
 * learner's switches: the only place that decides what is hidden.
 *
 * - Explore shows every note on the idea card. The board draws the
 *   candidates, and a note's ideas only when the learner points at it (but
 *   see "Moves on the board" below), since both would share the board's
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
 * - "Moves on the board" off keeps the candidates' arrows and Stockfish's
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
 * - While a note's idea plays back, the board is the playback's: nothing else
 *   is drawn, and the preview it started from stays.
 * - While a piece is dragged, or selected by a click, the board draws only
 *   its candidates, rare ones and Stockfish's top moves too. A drag draws
 *   them wherever the piece is over, so dragging across the board moves
 *   nothing else on it; the idea card shows the move under it. A click hides
 *   the resting best-move mark the same way, until the piece is unselected.
 * - Rare candidates (`Candidate.rare`) are left off the list, which shows
 *   them only when asked, and off the board's arrows; Stockfish's best isn't
 *   tagged on one either. Only a preview of one, or dragging its piece,
 *   draws it.
 *
 * guidance stays in lesson terms; lessonDrawings (./drawings.ts) turns it
 * into board shapes, and says which ideas draw nothing (`drawsOnBoard`).
 */
import type { Settings } from '@/settings/settings';

import { drawsOnBoard } from './drawings';
import type { Idea, Note, PositionKey, Uci } from './lesson';
import { type Candidate, mainCandidate } from './select';
import { type LandedTrap, type LessonView, type Preview, type ShownNote, shownKey } from './view';

export type LessonMode = 'explore' | 'practice';

/** The learner's switches on the lesson screen. */
export type LessonSwitches = Pick<Settings, 'auto' | 'showMoves' | 'showTraps'>;

/** Stockfish's view of the shown position, as far as it has arrived. */
export interface EngineView {
  /** Its first line's move: the best. */
  readonly best?: Uci;
  /**
   * The rows of its moves the list shows (`listedEngineMoves`), from its top
   * three, best first (`engineCandidates`).
   */
  readonly top?: readonly Candidate[];
  /** Its search has finished, so `best` won't change. */
  readonly final?: boolean;
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
  readonly pointed?: Note;
  /** The note whose idea plays back on the board. */
  readonly playing?: Note;
  readonly engine?: EngineView;
}

/** An idea to draw, and the position it is checked in. */
export interface ShownIdea {
  readonly idea: Idea;
  readonly at: PositionKey;
}

/** The ideas that play back: a plan's routes, a line's or trap's moves. */
export type PlayedBack = Extract<Idea, { type: 'plan' | 'line' | 'trap' }>;

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
  readonly pointable: readonly Note[];
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
  readonly pointed?: Note;
  /**
   * Stockfish's best move to mark, with "moves on the board" on, while nothing
   * is previewed, pointed at or playing back, when `tagsBest` says so.
   * Past the guide's moves it is the first of `top`: both come from one analysis.
   */
  readonly best?: Uci;
  /** Stockfish's rows the list shows (`listedEngineMoves`). */
  readonly top: readonly Candidate[];
  /** A trap the line fell into, while its card shows (see `trapShown`). */
  readonly trap?: LandedTrap;
  /** The line has reached a guide line's end, and the headline tells it (see `newsShown`). */
  readonly lineEnded: boolean;
}

/** Whether "Moves on the board" changes anything in `mode`: only in Explore. */
export const movesSwitchApplies = (mode: LessonMode) => mode === 'explore';

/** Whether Stockfish's top moves are listed: in Explore, past the guide's moves. */
export const listsTopMoves = (view: LessonView, mode: LessonMode) =>
  mode === 'explore' && view.place !== 'inside';

/**
 * Whether Stockfish's best move `uci` is tagged as the best: past the guide's
 * moves as soon as it arrives; inside them, where the candidates are what is
 * highlighted, only when it isn't one of them (rare ones included), and only
 * once its search is final: in about a quarter of lesson positions an earlier
 * depth names a move outside the guide that the final one doesn't.
 */
const tagsBest = (view: LessonView, engine: EngineView | undefined, uci: Uci) =>
  !view.candidates.length || (engine?.final === true && !isCandidate(view, uci));

/**
 * Stockfish's rows the list shows (`EngineView.top`), from its top three
 * (`engineCandidates`), in Explore: past the guide's moves all three, in the
 * candidates' place (`listsTopMoves`); inside, on the opponent's turn, its
 * best after the candidates, when the board tags it (`tagsBest`). The guide's reply often teaches a trick, so the learner can
 * practice both it and the strongest reply. Example: in the Urusov Gambit,
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
    tagsBest(view, { final }, best.move.uci);
  return listsBest ? [best] : [];
}

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
  const allowed = (idea: Idea) => idea.type !== 'trap' || switches.showTraps;
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
  const top = engine?.top ?? [];
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
  const best =
    explore && movesShown && !preview && !lifted && !playing && !pointedNote
      ? engine?.best
      : undefined;

  return {
    candidates,
    rare: withRare.filter(({ rare }) => rare),
    main: mainCandidate(candidates),
    preview,
    notes,
    pointable,
    ideas,
    drawn: firstPlanOnly(board.drawn),
    drawnCandidates: board.candidates,
    playable,
    playing,
    pointed: pointedNote,
    best: best && tagsBest(view, engine, best) ? best : undefined,
    top,
    trap,
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
  readonly pointed?: Note;
  readonly showMoves: boolean;
  /** The ideas of the notes on the move just played. */
  readonly moveIdeas: ReadonlySet<Idea>;
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

const hasTrap = (note: Note) => note.ideas?.some(({ type }) => type === 'trap') ?? false;

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
  const last = ply + movesPlayed;
  return movesPlayed < trap.moves.length ? view.ply <= last : newsShown(view, last);
}

/** `shown`'s ideas that `allowed` lets through, each with the position it is checked in. */
const noteIdeas = (shown: ShownNote, allowed: (idea: Idea) => boolean): ShownIdea[] =>
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
  note: Note,
): ShownPlayback | undefined {
  return playable.find(({ idea }) => note.ideas?.includes(idea));
}
