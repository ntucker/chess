import type { Tone } from '@/board/drawing';

// The colors of the board's drawings (src/board/drawing.ts). Imports nothing
// it would have to bundle, since the board runs in a web view on Android.
// The board looks the same in light and dark mode, so each tone has one
// color, chosen to read on both the parchment and the plum squares and to
// stay apart from the spotlight gold of the last move and the selection.
// No color reaches 3:1 contrast (WCAG's bar for shapes) against both squares:
// one dark enough to stand off the plum is nearly black, and one light enough
// is too pale for the parchment. So the tones stand apart from the squares by
// hue, as lichess's arrows do.

export const toneColors: Readonly<Record<Tone, string>> = {
  main: '#1f9a5c',
  other: '#3b78c4',
  engine: '#0d9aa8',
  plan: '#c27c0e',
  danger: '#d1303a',
  target: '#e2661b',
};
