/**
 * What the lesson screen shows, from the facts (./view.ts), the mode and the
 * learner's switches: the only place that decides what is hidden.
 *
 * - Explore shows every note on the idea card. The board draws the
 *   candidates, and a note's ideas only when the learner points at it, since
 *   both would share the board's colors; a previewed move draws its own
 *   ideas, and where no candidates are drawn every note's ideas are. "Show
 *   ideas on board" turns idea drawings off; the card still shows its notes.
 * - Practice hides every hint while it is the learner's turn: no candidates,
 *   previews, best move or top moves, and of the notes only those of the move
 *   just played, and a trap's warning while traps are shown. Right after the
 *   learner's move the card shows what it was for: the move's notes, then
 *   those of the position it was played in. On the opponent's turn it shows
 *   the opponent's candidates, and their previews, only on "I choose", since
 *   the learner has to pick one; on Auto the opponent just plays. Stockfish's
 *   moves stay hidden.
 * - Traps: with "show traps" on, a trap's sequence is drawn before the
 *   learner commits; off, it isn't. A trap fallen into is shown either way.
 * - While a note's idea plays back, the board is the playback's: nothing else
 *   is drawn, and the preview it started from stays.
 *
 * guidance stays in lesson terms; lessonDrawings (./drawings.ts) turns it
 * into board shapes.
 */
import { type Idea, ideaPosition, type Note, type PositionKey, type Uci } from './lesson';
import { type Candidate, mainCandidate } from './select';
import type { LandedTrap, LessonView, Preview, ShownNote } from './view';

export type LessonMode = 'explore' | 'practice';

/** The learner's switches on the lesson screen. */
export interface LessonSwitches {
  /** Auto: the opponent replies by itself. Off is "I choose". */
  readonly auto: boolean;
  /** Explore's "show ideas on board". */
  readonly showIdeas: boolean;
  readonly showTraps: boolean;
}

/** Stockfish's view of the shown position, as far as it has arrived. */
export interface EngineView {
  readonly best?: Uci;
  /** Its top three moves, best first. */
  readonly top?: readonly Uci[];
}

export interface GuidanceInput {
  readonly view: LessonView;
  readonly mode: LessonMode;
  readonly switches: LessonSwitches;
  /** The move the learner's pointer previews (`preview` in ./view.ts). */
  readonly preview?: Preview;
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
  /** The candidate to look at first (`mainCandidate`), drawn and listed as the main one. */
  readonly main?: Candidate;
  readonly preview?: Preview;
  /** The idea card's notes: the preview's while a move is previewed. */
  readonly notes: readonly ShownNote[];
  /** Of those notes, the ones the learner can point at: their ideas draw on the board. */
  readonly pointable: readonly Note[];
  /** The ideas of those notes the switches allow: what can be drawn or played back. */
  readonly ideas: readonly ShownIdea[];
  /** Of `ideas`, those the board draws now; of several plans, only the first. */
  readonly drawn: readonly ShownIdea[];
  /** The candidates whose arrows the board draws now. */
  readonly drawnCandidates: readonly Candidate[];
  /** The idea playing back, once its note's playback has started. */
  readonly playing?: ShownPlayback;
  /**
   * Stockfish's best move to mark, while nothing is previewed. Inside the
   * guide the candidates are what is highlighted, so it is tagged only when
   * it isn't one of them.
   */
  readonly best?: Uci;
  /** Stockfish's top three, listed only beyond the guide. */
  readonly top: readonly Uci[];
  readonly trap?: LandedTrap;
}

export function guidance(input: GuidanceInput): Guidance {
  const { view, mode, switches, pointed, engine } = input;
  const explore = mode === 'explore';
  const choices = explore || (!view.learnerToMove && !switches.auto);
  const preview = choices ? input.preview : undefined;
  const notes = preview?.notes ?? cardNotes(view, explore, switches.showTraps);
  const allowed = (idea: Idea) =>
    idea.type === 'trap' ? switches.showTraps : !explore || switches.showIdeas;
  const ideas = notes.flatMap((shown) => noteIdeas(shown, allowed));
  const candidates = choices ? view.candidates : [];
  const playing = input.playing && notePlayback(ideas, input.playing);
  // A note with nothing to draw leaves the board as it is.
  const pointable = notes
    .filter(({ note }) => note.ideas?.some((idea) => idea.type !== 'evaluation' && allowed(idea)))
    .map(({ note }) => note);
  const pointedNote = notes.find(({ note }) => note === pointed && pointable.includes(note));
  const board = boardShown({ candidates, preview, ideas, playing, pointed: pointedNote, allowed });
  const best = explore && !preview ? engine?.best : undefined;

  return {
    candidates,
    main: mainCandidate(candidates),
    preview,
    notes,
    pointable,
    ideas,
    drawn: firstPlanOnly(board.drawn),
    drawnCandidates: board.candidates,
    playing,
    best: view.candidates.some(({ move }) => move.uci === best) ? undefined : best,
    top: explore && view.place !== 'inside' ? (engine?.top ?? []) : [],
    trap: view.trap,
  };
}

/**
 * What the board draws: nothing while a note plays back; a pointed note's
 * ideas alone; a preview's ideas, with the pointed piece's candidates when
 * it doesn't slide; or else the candidates, with only traps beside them
 * (every idea where there are none).
 */
function boardShown({
  candidates,
  preview,
  ideas,
  playing,
  pointed,
  allowed,
}: {
  readonly candidates: readonly Candidate[];
  readonly preview?: Preview;
  readonly ideas: readonly ShownIdea[];
  readonly playing?: ShownPlayback;
  readonly pointed?: ShownNote;
  readonly allowed: (idea: Idea) => boolean;
}): { readonly candidates: readonly Candidate[]; readonly drawn: readonly ShownIdea[] } {
  if (playing) return { candidates: [], drawn: [] };
  if (pointed) return { candidates: [], drawn: noteIdeas(pointed, allowed) };
  if (preview) {
    const { slide, candidate } = preview;
    return {
      candidates: slide ? [] : candidates.filter(({ from }) => from === candidate.from),
      drawn: ideas,
    };
  }
  if (!candidates.length) return { candidates, drawn: ideas };
  return { candidates, drawn: ideas.filter(({ idea }) => idea.type === 'trap') };
}

/** The idea card's notes when no move is previewed. */
function cardNotes(view: LessonView, explore: boolean, showTraps: boolean): readonly ShownNote[] {
  if (explore) return view.notes;
  // The position's own notes would hint at the move, except a trap's warning.
  if (view.learnerToMove)
    return view.notes.filter(
      ({ note, before }) => before !== undefined || (showTraps && hasTrap(note)),
    );
  // Right after the learner's move: what it was for, now that it's played.
  const played = view.notes.filter(({ before }) => before !== undefined);
  const own = view.notes.filter(({ before }) => before === undefined);
  return [...played, ...view.playedFrom, ...own];
}

const hasTrap = (note: Note) => note.ideas?.some(({ type }) => type === 'trap') ?? false;

/** `shown`'s ideas that `allowed` lets through, each with the position it is checked in. */
const noteIdeas = (shown: ShownNote, allowed: (idea: Idea) => boolean): ShownIdea[] =>
  (shown.note.ideas ?? [])
    .filter(allowed)
    // checkIdea refuses `at: 'before'` on a position's note, so every idea has a position.
    .map((idea) => ({ idea, at: ideaPosition(idea, shown)! }));

/** One plan at a time: two plans' numbered routes would read as one sequence. */
function firstPlanOnly(ideas: readonly ShownIdea[]): readonly ShownIdea[] {
  const plan = ideas.find(({ idea }) => idea.type === 'plan');
  return ideas.filter((shown) => shown.idea.type !== 'plan' || shown === plan);
}

const playsBack = (shown: ShownIdea): shown is ShownPlayback =>
  shown.idea.type === 'plan' || shown.idea.type === 'line' || shown.idea.type === 'trap';

/**
 * The idea of `note` that plays back, of the `ideas` guidance shows (so a
 * trap plays back only while traps are shown); or undefined.
 */
export function notePlayback(ideas: readonly ShownIdea[], note: Note): ShownPlayback | undefined {
  return ideas.filter(playsBack).find(({ idea }) => note.ideas?.includes(idea));
}
