// Whether the ending card (EndingCard.tsx) is put aside, so the learner can
// see the board under it. Pure, so it's tested without a DOM.
import type { BoardPointer } from '@/board/pointer';

/**
 * The card put aside, so the learner can see the board under it: at which
 * final position (shown as its FEN), and by what. None while it is up.
 */
export type CardAside = { readonly at: string; readonly by: 'hover' | 'tap' } | undefined;

/**
 * The card's aside after `pointer` on the board at final position `at`. A
 * mouse puts it aside while over the board; a tap puts it aside or brings it
 * back. A mouse leaving brings back only a card it put aside, so a tap's
 * holds. Example: a tap, then a mouse passing over and off the board, leaves
 * the card aside.
 */
export function asideAfter(aside: CardAside, pointer: BoardPointer, at: string): CardAside {
  switch (pointer) {
    case 'enter':
      return aside ?? { at, by: 'hover' };
    case 'leave':
      return aside?.by === 'hover' ? undefined : aside;
    case 'tap':
      return aside ? undefined : { at, by: 'tap' };
  }
}
