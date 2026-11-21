// Imports only Silk's color helper, which imports nothing, so the board's web
// view can use it (theme.ts imports all of Silk).
import { oklch } from '@reactive/silk-core/color';

/** The discs that stand for each side outside the board. */
export const pieceColors = {
  white: oklch(0.977, 0.011, 85),
  black: oklch(0.192, 0.029, 303),
} as const;
