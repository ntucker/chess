import { oklch } from '@reactive/silk-core/color';

import type { Tone } from '@/board/drawing';

// The colors of the board's drawings (src/board/drawing.ts). Imports only
// `@reactive/silk-core/color`, which imports nothing, since the board runs in
// a web view on Android.
// The board looks the same in light and dark mode, so each tone has one
// color, chosen to read on both the parchment and the plum squares and to
// stay apart from the spotlight gold of the last move and the selection.
// No color reaches 3:1 contrast (WCAG's bar for shapes) against both squares:
// one dark enough to stand off the plum is nearly black, and one light enough
// is too pale for the parchment. So the tones stand apart from the squares by
// hue, as lichess's arrows do.

export const toneColors: Readonly<Record<Tone, string>> = {
  main: oklch(0.607, 0.14, 155.2),
  other: oklch(0.569, 0.134, 255.2),
  engine: oklch(0.628, 0.1056, 206.4),
  plan: oklch(0.645, 0.137, 69.5),
  danger: oklch(0.567, 0.196, 23.3),
  target: oklch(0.653, 0.173, 46),
};
