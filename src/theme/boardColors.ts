// Imports only `@reactive/silk-core/color`, which imports nothing, like the
// other colors a board reads (drawingTones.ts, pieceColors.ts).
import { oklch } from '@reactive/silk-core/color';

/**
 * The board's squares and its spotlight gold, in OKLCH, as Board.css paints
 * them in the board's web view (boardColors.test.ts keeps the two in step).
 */
export const BOARD_OKLCH = {
  light: [0.907, 0.036, 84],
  dark: [0.575, 0.068, 318],
  gold: [0.751, 0.1295, 79.8],
} as const satisfies Record<string, readonly [number, number, number]>;

/** The board's colors for a board drawn outside its web view: the small boards in notes. */
export const boardColors = {
  light: oklch(...BOARD_OKLCH.light),
  dark: oklch(...BOARD_OKLCH.dark),
  /** The last move's squares, as Board.css lights them. */
  lastMove: oklch(...BOARD_OKLCH.gold, 0.5),
  /** A selected square, as Board.css lights it: a square a note names. */
  selected: oklch(...BOARD_OKLCH.gold, 0.75),
} as const;
