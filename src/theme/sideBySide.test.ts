import { describe, expect, it, jest } from '@jest/globals';

import { NARROW_PX, PX } from '@/theme/narrow';

import { BOARD_COLUMN_MAX, boardColumnLimit } from './sideBySide';

// Jest can't load a stylesheet.
jest.mock('@/theme/narrow.css', () => ({}));

// The native twin of the web's clamp (boardColumnLimitCss).
describe('boardColumnLimit', () => {
  // What the board column needs beside the board: the disc and its gap.
  const beside = NARROW_PX['player-disc'] + NARROW_PX['player-disc-gap'];

  it('shrinks the board to its smallest in a short window, as the web does', () => {
    expect(boardColumnLimit(568, PX.narrow)).toBe(NARROW_PX['board-min'] + beside);
  });

  it('fits the board to the height between, and to its largest in a tall one', () => {
    expect(boardColumnLimit(4000, PX.wide)).toBe(BOARD_COLUMN_MAX);
    expect(boardColumnLimit(900, PX.narrow)).toBeGreaterThan(boardColumnLimit(800, PX.narrow));
  });

  it('keeps room under the panel for controls fixed there', () => {
    expect(boardColumnLimit(800, PX.narrow, true)).toBe(
      boardColumnLimit(800, PX.narrow) - NARROW_PX['program-foot'],
    );
  });
});
