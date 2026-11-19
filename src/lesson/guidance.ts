/**
 * What the lesson screen shows, from the facts (./view.ts), the mode and the
 * learner's switches: the only place that decides what is hidden.
 *
 * - Explore shows everything. "Show ideas on board" turns idea drawings off;
 *   the idea card still shows its notes.
 * - Practice hides every hint while it is the learner's turn: no candidates,
 *   previews, best move or top moves, and of the notes only those of the move
 *   just played. On the opponent's turn it shows the opponent's candidates,
 *   and their previews, only on "I choose", since the learner has to pick
 *   one; on Auto the opponent just plays. Stockfish's moves stay hidden.
 * - Traps: with "show traps" on, a trap's sequence is drawn before the
 *   learner commits; off, it isn't. A trap fallen into is shown either way.
 *
 * guidance stays in lesson terms; lessonDrawings (./drawings.ts) turns it
 * into board shapes.
 */
import { type Idea, type PositionKey, type Uci } from './lesson';
import type { Candidate } from './select';
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
  readonly engine?: EngineView;
}

/** An idea to draw, and the position it is checked in. */
export interface ShownIdea {
  readonly idea: Idea;
  readonly at: PositionKey;
}

export interface Guidance {
  /** The candidate list, and the candidates drawn on the board. */
  readonly candidates: readonly Candidate[];
  readonly preview?: Preview;
  /** The idea card's notes: the preview's while a move is previewed. */
  readonly notes: readonly ShownNote[];
  /** The ideas to draw on the board, from those notes. */
  readonly ideas: readonly ShownIdea[];
  /**
   * Stockfish's best move to mark. Inside the guide the candidates are what
   * is highlighted, so it is tagged only when it isn't one of them.
   */
  readonly best?: Uci;
  /** Stockfish's top three, listed only beyond the guide. */
  readonly top: readonly Uci[];
  readonly trap?: LandedTrap;
}

export function guidance({ view, mode, switches, preview, engine }: GuidanceInput): Guidance {
  const explore = mode === 'explore';
  const choices = explore || (!view.learnerToMove && !switches.auto);
  const previewed = choices ? preview : undefined;
  const notes =
    previewed?.notes ??
    (explore || !view.learnerToMove
      ? view.notes
      : view.notes.filter(({ before }) => before !== undefined));
  const drawn = (idea: Idea) =>
    idea.type === 'trap' ? switches.showTraps : !explore || switches.showIdeas;
  const best = explore ? engine?.best : undefined;

  return {
    candidates: choices ? view.candidates : [],
    preview: previewed,
    notes,
    ideas: notes.flatMap((shown) =>
      (shown.note.ideas ?? [])
        .filter(drawn)
        .map((idea) => ({ idea, at: shown.after })),
    ),
    best: view.candidates.some(({ move }) => move.uci === best) ? undefined : best,
    top: explore && view.place !== 'inside' ? (engine?.top ?? []) : [],
    trap: view.trap,
  };
}
