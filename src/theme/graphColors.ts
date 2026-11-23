import { oklch } from '@reactive/silk-core/color';

import { BOARD_OKLCH } from './boardColors';
import { pieceColors } from './pieceColors';

/**
 * The review's graph of the game (`ReviewGraph`), the evaluation bar laid on
 * its side in softer tones: the same in the dark and the light theme, as the
 * board is. The two areas stand about 9 to 1 apart (graphColors.test.ts).
 */
export const graphColors = {
  /** White's share of the expected score. */
  white: oklch(0.87, 0.03, 85),
  /** Black's share. */
  black: oklch(0.31, 0.04, 305),
  /** Even, across the middle. */
  middle: oklch(0.6, 0.115, 80, 0.7),
  /** The stripes over Black's area where no analysis has read the game yet. */
  hatch: oklch(0.37, 0.04, 305),
  /** The move the page shows: the board's spotlight gold. */
  current: oklch(...BOARD_OKLCH.gold),
  /**
   * The edge around the marks that cross both areas (the gold line, the
   * scrub line, the dots), so each reads on White's light area as well as
   * Black's dark one.
   */
  edge: pieceColors.black,
  /** The scrub line, and the rim of a dot. */
  scrub: pieceColors.white,
} as const;
