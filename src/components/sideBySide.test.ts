import { describe, expect, it, jest } from '@jest/globals';

import { NARROW_PX, type Px } from '@/theme/narrow';

import { boardColumnLimit } from './sideBySide';

// Jest can't load a stylesheet.
jest.mock('@/theme/narrow.css', () => ({}));

// The native twin of the web's clamp (BOARD_COLUMN_LIMIT_CSS).
describe('boardColumnLimit', () => {
  const narrow: Px = (length) => length.narrow;
  const wide: Px = (length) => length.wide;
  // What the board column needs beside the board: the disc and its gap.
  const beside = NARROW_PX['player-disc'] + NARROW_PX['player-disc-gap'];

  it('shrinks the board to its smallest in a short window, as the web does', () => {
    expect(boardColumnLimit(568, narrow)).toBe(NARROW_PX['board-min'] + beside);
  });

  it('fits the board to the height between, and to its largest in a tall one', () => {
    const tall = boardColumnLimit(4000, wide);
    expect(tall).toBe(720 + 28 + 12);
    expect(boardColumnLimit(900, narrow)).toBeGreaterThan(boardColumnLimit(800, narrow));
  });
});
