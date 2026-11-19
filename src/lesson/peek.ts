/**
 * What the lesson's board shows beyond the game, as a reducer: what the
 * learner points at (a candidate, by its list row or a board square, and a
 * note on the idea card), or a note's idea playing back. One at a time:
 * while an idea plays, the board is its own and pointing waits. Each peek
 * belongs to the position it started in, and ends once the board moves on.
 */
import type { Note, PositionKey } from './lesson';
import type { Pointer } from './view';

/** What the learner points at, in the position it was pointed at in. */
interface Pointing {
  readonly key: PositionKey;
  readonly candidate?: Pointer;
  readonly note?: Note;
}

export type Peek =
  | (Pointing & { readonly kind: 'point' })
  /** A note's idea playing back, beside the pointing it started from. */
  | (Pointing & {
      readonly kind: 'play';
      /** The note whose idea plays back, pointed at or not. */
      readonly played: Note;
      /** Which board of the playback: 0 is where the idea starts. */
      readonly step: number;
      /** It steps by itself until the learner steps it. */
      readonly auto: boolean;
    });

export type PeekAction =
  /** The board shows `key`: a peek from another position ends. */
  | { readonly type: 'board'; readonly key: PositionKey }
  /**
   * The learner points at a candidate, by its row or square, which leaves
   * the card's note; or at a square without one, which keeps it.
   */
  | { readonly type: 'candidate'; readonly key: PositionKey; readonly candidate?: Pointer }
  /** The learner points at a note on the idea card, or at none. */
  | { readonly type: 'note'; readonly key: PositionKey; readonly note?: Note }
  /** The learner leaves the candidates and the idea card. A playback goes on. */
  | { readonly type: 'leave' }
  /** Plays `note`'s idea back from the candidate pointed at now. */
  | { readonly type: 'play'; readonly key: PositionKey; readonly note: Note }
  /** The playback's next board, by itself. */
  | { readonly type: 'step' }
  /** The learner steps the playback to board `step`. */
  | { readonly type: 'goto'; readonly step: number }
  /** Back to the game, pointing as the playback started. */
  | { readonly type: 'stop' };

export function peekReducer(peek: Peek | undefined, action: PeekAction): Peek | undefined {
  switch (action.type) {
    case 'board':
      return peek?.key === action.key ? peek : undefined;
    case 'candidate':
    case 'note': {
      const here = peek?.key === action.key ? peek : undefined;
      if (here?.kind === 'play') return peek;
      const now: Pointing = here ?? { key: action.key };
      const next: Pointing =
        action.type === 'note'
          ? { ...now, note: action.note }
          : action.candidate
            ? { key: action.key, candidate: action.candidate }
            : { ...now, candidate: undefined };
      // Pointing that changes nothing keeps the same state, so nothing re-renders.
      return samePointing(now, next) ? peek : { ...next, kind: 'point' };
    }
    case 'leave':
      return peek?.kind === 'play' ? peek : undefined;
    case 'play': {
      const { candidate, note } = peek?.key === action.key ? peek : {};
      const played = action.note;
      return { kind: 'play', key: action.key, candidate, note, played, step: 0, auto: true };
    }
    case 'step':
      return peek?.kind === 'play' ? { ...peek, step: peek.step + 1 } : peek;
    case 'goto':
      return peek?.kind === 'play' ? { ...peek, step: action.step, auto: false } : peek;
    case 'stop':
      return peek?.kind === 'play'
        ? { kind: 'point', key: peek.key, candidate: peek.candidate, note: peek.note }
        : peek;
  }
}

const samePointer = (a?: Pointer, b?: Pointer) =>
  a === b ||
  (a?.at === 'row' && b?.at === 'row' && a.uci === b.uci) ||
  (a?.at === 'square' && b?.at === 'square' && a.square === b.square);

const samePointing = (a: Pointing, b: Pointing) =>
  a.key === b.key && a.note === b.note && samePointer(a.candidate, b.candidate);
