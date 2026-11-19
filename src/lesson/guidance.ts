/**
 * What the lesson screen shows, given the facts (./view.ts), the mode and
 * the learner's switches: the only place that decides what is hidden.
 *
 * - Explore shows everything. "Show ideas on board" turns idea drawings off;
 *   the idea card still shows its notes.
 * - Practice hides every hint at the learner's own move while it is the
 *   learner's turn: no candidates, previews, best move or top moves, and of
 *   the notes only those of the move just played. On the opponent's turn it
 *   shows the opponent's candidates only on "I choose", since the learner has
 *   to pick one; on Auto the opponent just plays.
 * - Traps: with "show traps" on, a trap's sequence is drawn before the
 *   learner commits; off, it isn't, and only a trap walked into is shown.
 */
import type { Idea, PositionKey, Uci } from './lesson';
import type { Candidate } from './select';
import type { LessonView, Preview, ShownNote, WalkedTrap } from './view';

export type LessonMode = 'explore' | 'practice';

/** The learner's switches on the lesson screen. */
export interface LessonSwitches {
  /** Auto: the opponent replies by itself. Off is "I choose". */
  readonly auto: boolean;
  /** Explore's "show ideas on board". */
  readonly showIdeas: boolean;
  readonly showTraps: boolean;
}

/**
 * An idea to draw, with the positions around it (see ShownNote): it is
 * checked in `after`, or in `before` when it says `at: 'before'`.
 */
export interface ShownIdea {
  readonly idea: Idea;
  readonly before: PositionKey;
  readonly after: PositionKey;
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
  /** A trap walked into, once its punishment (the reply) is on the board. */
  readonly trap?: WalkedTrap;
}

export function guidance(view: LessonView, mode: LessonMode, switches: LessonSwitches): Guidance {
  const hints = mode === 'explore' || (!view.learnerToMove && !switches.auto);
  const preview = hints ? view.preview : undefined;
  const notes =
    preview?.notes ??
    (hints || !view.learnerToMove ? view.notes : view.notes.filter(({ on }) => on === 'move'));
  const drawn = (idea: Idea) =>
    idea.type === 'trap' ? switches.showTraps : mode === 'practice' || switches.showIdeas;
  const inside = view.place === 'inside';

  return {
    candidates: hints ? view.candidates : [],
    preview,
    notes,
    ideas: notes.flatMap(({ note, before, after }) =>
      (note.ideas ?? []).filter(drawn).map((idea) => ({ idea, before, after })),
    ),
    best:
      hints && !(inside && view.candidates.some(({ move }) => move.uci === view.best))
        ? view.best
        : undefined,
    top: hints && !inside ? view.top : [],
    trap: view.trap && view.trap.played >= 2 ? view.trap : undefined,
  };
}
