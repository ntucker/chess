/**
 * What the lesson's board shows beyond the game, as a reducer: what the
 * learner points at (a candidate, by its list row or a piece dragged onto
 * its square, and a note on the idea card), or a note's idea playing back.
 * While an idea plays, the board is its own: pointing goes on out of sight,
 * and the board shows it once the playback stops. Each peek belongs to the
 * position it started in, and ends once the board moves on (the screen's
 * `board` action).
 */
import type { Note, PositionKey } from './lesson';
import type { Pointer } from './view';

/**
 * How long a row stays pointed at before the idea card holds on to it. Rows
 * point at once, so a pointer going down to the card crosses others on the
 * way; reaching the card within this time of the last one returns to the row
 * held before (the `card` action).
 */
export const HOLD_MS = 150;

/** What the learner points at, in the position it was pointed at in. */
interface Pointing {
  readonly key: PositionKey;
  readonly candidate?: Pointer;
  readonly note?: Note;
  /** Set while a hovering pointer points at `candidate`. Only this reducer reads it. */
  readonly hover?: Hover;
}

/** A hovering pointer's way through the rows, for the `card` action. */
interface Hover {
  /** When it pointed at the candidate. */
  readonly since: number;
  /** The last candidate it pointed at for `HOLD_MS` or more before another took its place. */
  readonly held?: Pointer;
}

export type Peek =
  | (Pointing & { readonly kind: 'point' })
  /** A note's idea playing back, beside what the learner points at meanwhile. */
  | (Pointing & {
      readonly kind: 'play';
      /** The note whose idea plays back, pointed at or not. */
      readonly played: Note;
      /** The candidate previewed when it started, whose position it plays in. */
      readonly from?: Pointer;
      /** Which board of the playback: 0 is where the idea starts. */
      readonly step: number;
      /** It steps by itself until the learner steps it. */
      readonly auto: boolean;
    });

export type PeekAction =
  /**
   * The learner points at a candidate, by its row or by dragging its piece
   * there, which leaves the card's note; or drags onto no candidate, which
   * keeps it. `time` is when a hovering pointer pointed (milliseconds, the
   * `card` action's clock), so the card can tell a row crossed on the way
   * from one held; focus, taps and drags carry none.
   */
  | {
      readonly type: 'candidate';
      readonly key: PositionKey;
      readonly candidate?: Pointer;
      readonly time?: number;
    }
  /**
   * The pointer reaches the idea card at `time`. A candidate pointed at less
   * than `HOLD_MS` before was crossed on the way, so the held one returns.
   */
  | { readonly type: 'card'; readonly key: PositionKey; readonly time: number }
  /** The learner points at a note on the idea card, or at none. */
  | { readonly type: 'note'; readonly key: PositionKey; readonly note?: Note }
  /**
   * The learner lets `note` on the idea card go (the mouse leaves it, or a
   * second tap on a touch screen): it is no longer pointed at, if it was,
   * even while a switch hides its ideas. Another note pointed at by keyboard
   * focus stays.
   */
  | { readonly type: 'leaveNote'; readonly key: PositionKey; readonly note: Note }
  /** The learner leaves the candidates and the idea card. A playback goes on, pointing at none. */
  | { readonly type: 'leave' }
  /**
   * Plays `note`'s idea back from the candidate pointed at now, or from the
   * one the playback on the board plays from.
   */
  | { readonly type: 'play'; readonly key: PositionKey; readonly note: Note }
  /** The playback's next board, by itself. */
  | { readonly type: 'step' }
  /** The learner steps the playback to board `step`. */
  | { readonly type: 'goto'; readonly step: number }
  /** Back to the game, pointing at what the learner points at now. */
  | { readonly type: 'stop' };

export function peekReducer(peek: Peek | undefined, action: PeekAction): Peek | undefined {
  switch (action.type) {
    case 'candidate':
    case 'note': {
      const here = peek?.key === action.key ? peek : undefined;
      const now: Pointing = here ?? { key: action.key };
      const next: Pointing =
        action.type === 'note'
          ? { ...now, note: action.note }
          : action.candidate
            ? {
                key: action.key,
                candidate: action.candidate,
                hover:
                  action.time === undefined
                    ? undefined
                    : { since: action.time, held: heldAt(now, action.time) },
              }
            : { ...now, candidate: undefined, hover: undefined };
      // A press or focus on the candidate the mouse points at holds it: it
      // clears the hover record. Any other pointing that changes nothing
      // keeps the same state, so nothing re-renders.
      const holds = now.hover && !next.hover;
      if (samePointing(now, next) && !holds) return peek;
      return repoint(here, next);
    }
    case 'card': {
      const here = peek?.key === action.key ? peek : undefined;
      if (!here?.candidate) return peek;
      // The candidate held then: the one pointed at now, or if it was only
      // crossed on the way, the one held before it.
      const back = heldAt(here, action.time);
      if (!back || samePointer(back, here.candidate)) return peek;
      return { ...here, candidate: back, hover: undefined };
    }
    case 'leaveNote':
      return peek?.key === action.key && peek.note === action.note
        ? { ...peek, note: undefined }
        : peek;
    case 'leave':
      return peek?.kind === 'play'
        ? { ...peek, candidate: undefined, note: undefined, hover: undefined }
        : undefined;
    case 'play': {
      const here = peek?.key === action.key ? peek : undefined;
      const { candidate, note } = here ?? {};
      const from = here?.kind === 'play' ? here.from : candidate;
      const played = action.note;
      return { kind: 'play', key: action.key, candidate, note, from, played, step: 0, auto: true };
    }
    case 'step':
      return peek?.kind === 'play' ? { ...peek, step: peek.step + 1 } : peek;
    case 'goto':
      return peek?.kind === 'play' ? { ...peek, step: action.step, auto: false } : peek;
    case 'stop':
      return peek?.kind === 'play' ? repoint(undefined, peek) : peek;
  }
}

/**
 * The candidate held once `pointing`'s is left at `time`: its own, if pointed
 * at for `HOLD_MS` or more (or not by hovering), else the one held before it.
 */
const heldAt = ({ candidate, hover }: Pointing, time: number) =>
  candidate && (!hover || time - hover.since >= HOLD_MS) ? candidate : hover?.held;

/** `here` pointing at `next` instead, a playback going on unseen. */
const repoint = (here: Peek | undefined, next: Pointing): Peek => {
  const { candidate, note, hover } = next;
  return here?.kind === 'play'
    ? { ...here, candidate, note, hover }
    : { kind: 'point', key: next.key, candidate, note, hover };
};

/** Whether two pointers point at the same candidate, by its row or its piece's drag. */
export const samePointer = (a?: Pointer, b?: Pointer) =>
  a === b ||
  (a?.at === 'row' && b?.at === 'row' && a.uci === b.uci) ||
  (a?.at === 'drag' && b?.at === 'drag' && a.from === b.from && a.to === b.to) ||
  (a?.at === 'select' && b?.at === 'select' && a.from === b.from);

const samePointing = (a: Pointing, b: Pointing) =>
  a.key === b.key && a.note === b.note && samePointer(a.candidate, b.candidate);
