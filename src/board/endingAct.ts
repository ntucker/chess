// How the board acts out a game's ending: which king takes the light and
// which falls, when each beat happens, and where the sparks and confetti fly.
// Board.tsx puts it on the board and Board.css draws it; EndingCard.tsx reads
// the same times, so the card and the board keep step. Pure, so it's tested
// without a DOM, and it imports nothing it would have to bundle, since the
// board runs in a web view on Android.
import { type Square, squareOffset } from '@/board/drawing';
import type { Ending, Mood } from '@/game/ending';
import type { Color } from '@/game/replay';

/**
 * A king's part in the ending: the winner stands in gold, the mated king
 * falls over, and in a draw both stay level.
 */
export const KING_PARTS = ['winner', 'fallen', 'level'] as const;
export type KingPart = (typeof KING_PARTS)[number];

export interface ActKing {
  readonly square: Square;
  readonly part: KingPart;
  /** Squares right and down from the board's top left corner, as the learner sees it. */
  readonly at: readonly [number, number];
  /** Which way a fallen king tips: 1 to the right, -1 to the left. */
  readonly lean: 1 | -1;
}

/** A spark thrown from the winning king. Lengths are in squares. */
export interface Spark {
  /** How far it flies, right and down. */
  readonly to: readonly [number, number];
  readonly size: number;
  /** Milliseconds after the burst that it leaves, and how long it flies. */
  readonly delay: number;
  readonly duration: number;
  readonly tint: Tint;
}

/** A piece of confetti falling down the board. Lengths are in squares. */
export interface Confetto {
  /** Where its square starts, from the board's left edge, and how far it drifts sideways on the way down. */
  readonly x: number;
  readonly drift: number;
  readonly size: number;
  /** Turns it tumbles through; negative turns the other way. */
  readonly spin: number;
  readonly delay: number;
  readonly duration: number;
  readonly tint: Tint;
}

/** A particle's color; Board.css has a class for each. */
export const TINTS = ['gold', 'pale', 'ivory', 'rose'] as const;
export type Tint = (typeof TINTS)[number];

export interface EndingAct {
  readonly mood: Mood;
  readonly kings: readonly ActKing[];
  /**
   * The learner's king, where the one light left on falls when the house
   * goes dark: their win's spotlight, or the lone spot on their fallen king.
   * A draw dims nothing, so it has none.
   */
  readonly spot?: readonly [number, number];
  /** Thrown from the learner's king when they win. */
  readonly sparks: readonly Spark[];
  /** Falls over the whole board when they win. */
  readonly confetti: readonly Confetto[];
}

/**
 * When each beat of an ending starts, in milliseconds after the ending
 * arrives. The mating move is still sliding in for the first MOVE_MS.
 */
export interface ActTimes {
  /** The mated king starts to fall. */
  readonly fall: number;
  /** The house lights go down. */
  readonly dim: number;
  /** The winner's king takes the light; in a draw, both kings. */
  readonly rise: number;
  /** The card comes on over the board, and leaves. */
  readonly card: number;
  readonly cardOut: number;
  /** The lights come back up, leaving the position to study. */
  readonly up: number;
}

/** How long chessground slides the last move in. */
export const MOVE_MS = 200;

/**
 * A win is quick: the rival's king is knocked down as the move lands and the
 * learner's king is lit at once. A loss is slow: the lights sink first, the
 * learner's king takes its time to fall, and the card waits for it. A draw
 * only pauses.
 */
export const ACT_TIMES: Readonly<Record<Mood, ActTimes>> = {
  won: { fall: 220, dim: 300, rise: 420, card: 640, cardOut: 3000, up: 3100 },
  lost: { fall: 380, dim: 240, rise: 1100, card: 1150, cardOut: 3700, up: 3800 },
  drawn: { fall: 0, dim: 240, rise: 300, card: 380, cardOut: 2500, up: 2600 },
};

/**
 * The ending as the board plays it for the learner, who sits on
 * `orientation`'s side. Example: after Scholar's mate with White at
 * the bottom, the king on e1 is the winner and the one on e8 falls to the left.
 */
export function endingAct(
  { mood, kings: squares }: Pick<Ending, 'mood' | 'kings'>,
  orientation: Color,
): EndingAct {
  const king = (color: Color, part: KingPart): ActKing => {
    const square = squares[color];
    const at = squareOffset(square, orientation);
    // It tips toward the middle of the board, where there is room to see it.
    return { square, part, at, lean: at[0] < 4 ? 1 : -1 };
  };
  const won = mood === 'won';
  const winner = won ? orientation : opposite(orientation);
  const kings =
    mood === 'drawn'
      ? [king('white', 'level'), king('black', 'level')]
      : [king(winner, 'winner'), king(opposite(winner), 'fallen')];
  const learnerSpot = kings.find(({ square }) => square === squares[orientation])!.at;
  return {
    mood,
    kings,
    ...(mood !== 'drawn' && { spot: learnerSpot }),
    sparks: won ? sparks() : [],
    confetti: won ? confetti() : [],
  };
}

// Its own, rather than replay.ts's, so the board's web view bundles none of the chess rules.
const opposite = (color: Color): Color => (color === 'white' ? 'black' : 'white');

/**
 * Where the card sits so it covers neither king: across the middle two ranks
 * unless a king stands there, then the two above or below them.
 */
export type CardBand = 'upper' | 'middle' | 'lower';

export function cardBand(kings: Ending['kings'], orientation: Color): CardBand {
  const rows = Object.values(kings).map((square) => squareOffset(square, orientation)[1]);
  const free = (from: number) => !rows.some((row) => row >= from && row < from + 2);
  // Two kings block at most two of the three bands.
  return free(3) ? 'middle' : free(1) ? 'upper' : 'lower';
}

/**
 * Random numbers from 0 to 1 that come out the same every time (mulberry32),
 * so an ending looks the same on each showing and in the tests.
 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPARKS = 20;
const CONFETTI = 40;
const round = (n: number) => Math.round(n * 100) / 100;

/** A ring of sparks, each a little off its even place, flying one to three squares. */
function sparks(): Spark[] {
  const random = seeded(7);
  return Array.from({ length: SPARKS }, (_, i) => {
    const angle = ((i + random() * 0.7) / SPARKS) * 2 * Math.PI;
    const reach = 1.1 + random() * 1.9;
    return {
      to: [round(Math.cos(angle) * reach), round(Math.sin(angle) * reach)],
      size: round(0.16 + random() * 0.16),
      delay: Math.round(random() * 110),
      duration: Math.round(620 + random() * 420),
      tint: TINTS[i % 3],
    };
  });
}

/** Confetti spread evenly over the board's width, let go over most of a second. */
function confetti(): Confetto[] {
  const random = seeded(11);
  return Array.from({ length: CONFETTI }, (_, i) => ({
    // Its speck is in the middle of a box one square wide.
    x: round(((i + random()) / CONFETTI) * 8 - 0.5),
    drift: round((random() - 0.5) * 2),
    size: round(0.16 + random() * 0.12),
    spin: round((1 + random() * 2) * (random() < 0.5 ? -1 : 1)),
    delay: Math.round(random() * 900),
    duration: Math.round(1600 + random() * 1000),
    tint: TINTS[Math.floor(random() * TINTS.length)],
  }));
}
