/**
 * What the board can draw on top of the position: the board's whole drawing
 * vocabulary, as JSON so it crosses into the board's web view on Android.
 * Callers (lesson ideas, candidate moves, move labels) turn their own facts
 * into these shapes; the board knows nothing about why a shape is there.
 *
 * Only types are imported, so the board and its callers share this file
 * without depending on each other.
 */
import type { MoveQuality } from '@/analysis/quality';
import type { Color, Role, SquareName } from 'chessops/types';

/** A square's name, like `e4` (chessops' type, so lesson data needs no conversion). */
export type Square = SquareName;

/**
 * How much a drawing stands out and what it means to the eye, not its color
 * and not a lesson word. src/theme/drawingTones.ts maps each tone to a color.
 * - `main`: the move or piece to look at first, like the guide's main move.
 * - `other`: the alternatives beside it, like the other candidate moves.
 * - `engine`: the engine's view, like Stockfish's best move where it differs.
 * - `plan`: moves one side wants to make later, without the replies.
 * - `danger`: what goes wrong, like a threat or a trap.
 * - `target`: what is aimed at: a piece or square under attack or wanted.
 */
export const TONES = ['main', 'other', 'engine', 'plan', 'danger', 'target'] as const;
export type Tone = (typeof TONES)[number];

/**
 * One shape. Later drawings are drawn over earlier ones, and where two light
 * the same piece (a `glow` and a `badge`), the later one's color wins.
 */
export type Drawing =
  /** The piece on `square` lights up. Pieces are lit, never their squares. */
  | { readonly kind: 'glow'; readonly square: Square; readonly tone: Tone }
  /**
   * An arrow. `step` numbers it, for a sequence of moves (a trap's moves, a
   * plan's routes); `dashed` marks a move that isn't on the board yet (a plan).
   */
  | {
      readonly kind: 'arrow';
      readonly from: Square;
      readonly to: Square;
      readonly tone: Tone;
      readonly step?: number;
      readonly dashed?: boolean;
    }
  /** A line through squares in order, without a head: a pawn chain. Drawn under the pieces. */
  | { readonly kind: 'line'; readonly squares: readonly Square[]; readonly tone: Tone }
  /** A ring around a square: a target, or a pawn with a structural feature. */
  | { readonly kind: 'ring'; readonly square: Square; readonly tone: Tone }
  /**
   * Empty squares tinted: an open file, an area, a weak square. Pieces are
   * never shown by their square; glow or ring them instead.
   */
  | { readonly kind: 'tint'; readonly squares: readonly Square[]; readonly tone: Tone }
  /** A short tag on a square, like "3 v 2". Keep it to a few characters. */
  | { readonly kind: 'label'; readonly square: Square; readonly text: string; readonly tone: Tone }
  /** A see-through piece on `square`: where a piece was, or will be. */
  | { readonly kind: 'ghost'; readonly square: Square; readonly piece: { readonly role: Role; readonly color: Color } }
  /** A move label's badge on the piece on `square`, which also glows in the label's color. */
  | { readonly kind: 'badge'; readonly square: Square; readonly quality: MoveQuality }
  /** Every piece fades except those on `except`: to show a pawn structure. */
  | { readonly kind: 'fade'; readonly except: readonly Square[] };
