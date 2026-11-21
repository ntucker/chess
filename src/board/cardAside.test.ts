import { describe, expect, it } from '@jest/globals';

import { asideAfter, type CardAside } from '@/board/cardAside';
import type { BoardPointer } from '@/board/pointer';

describe('asideAfter', () => {
  const FEN = 'final';
  const after = (...pointers: BoardPointer[]) =>
    pointers.reduce<CardAside>((aside, pointer) => asideAfter(aside, pointer, FEN), undefined);

  it('puts the card aside while a mouse is over the board', () => {
    expect(after('enter')).toEqual({ at: FEN, by: 'hover' });
    expect(after('enter', 'leave')).toBeUndefined();
  });

  it('puts the card aside on a tap, and brings it back on the next', () => {
    expect(after('tap')).toEqual({ at: FEN, by: 'tap' });
    expect(after('tap', 'tap')).toBeUndefined();
  });

  it("keeps a tap's aside when a mouse passes over and off the board", () => {
    expect(after('tap', 'enter', 'leave')).toEqual({ at: FEN, by: 'tap' });
  });
});
