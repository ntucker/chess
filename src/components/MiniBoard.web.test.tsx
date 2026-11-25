import { describe, expect, it, jest } from '@jest/globals';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { uciLine } from '@/lesson/lesson.fixture';
import { lineKeys } from '@/lesson/select';
import { boardColors } from '@/theme/boardColors';

import { MiniBoard } from './MiniBoard';

// Each piece names itself, so the test can read where it stands.
jest.mock('./PieceGlyph', () => ({
  PieceGlyph: ({ role, color }: { role: string; color: string }) =>
    jest.requireActual<typeof import('react')>('react').createElement('i', {
      title: `${color} ${role}`,
    }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AFTER_E4 = lineKeys(uciLine('e4'))[1];

/**
 * Each square's piece (or ''), whether it is lit, and whether the piece paints
 * above the tint (positioned, and after it), top left to bottom right.
 */
function squares(orientation: 'white' | 'black', position: string | undefined) {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() =>
    root.render(
      <MiniBoard
        position={position}
        orientation={orientation}
        lit={['e2', 'e4']}
        highlight="lastMove"
        squareSize={20}
      />,
    ),
  );
  const lit = (square: Element) =>
    [...square.children].some(
      (child) => getComputedStyle(child).backgroundColor === toRgb(boardColors.lastMove),
    );
  const result = [...host.firstElementChild!.children]
    .flatMap((rank) => [...rank.children])
    .map((square) => ({
      piece: square.querySelector('i')?.title ?? '',
      lit: lit(square),
      pieceOnTop:
        !!square.lastElementChild?.querySelector('i') &&
        getComputedStyle(square.lastElementChild).position === 'absolute',
    }));
  act(() => root.unmount());
  return result;
}

/** A color as the browser reports a computed one. */
function toRgb(color: string): string {
  const probe = document.createElement('div');
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

describe('MiniBoard', () => {
  it('shows the position as White sees it, with the lit squares', () => {
    const board = squares('white', AFTER_E4);
    expect(board).toHaveLength(64);
    expect(board[0].piece).toBe('black rook'); // a8
    expect(board[4].piece).toBe('black king'); // e8
    expect(board[63].piece).toBe('white rook'); // h1
    // e4 and e2: rank 4 and rank 2 from the top are rows 4 and 6.
    expect(board.flatMap((square, n) => (square.lit ? [n] : []))).toEqual([36, 52]);
    expect(board[36].piece).toBe('white pawn');
    expect(board[36].pieceOnTop).toBe(true);
  });

  it('turns it round for Black', () => {
    const board = squares('black', AFTER_E4);
    expect(board[0].piece).toBe('white rook'); // h1
    expect(board[3].piece).toBe('white king'); // e1
    expect(board[63].piece).toBe('black rook'); // a8
    expect(board.flatMap((square, n) => (square.lit ? [n] : []))).toEqual([11, 27]);
  });

  it('draws the squares alone with no position', () => {
    const board = squares('white', undefined);
    expect(board).toHaveLength(64);
    expect(board.every((square) => square.piece === '')).toBe(true);
  });

  it('draws nothing for a key that is not a position', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <MiniBoard position="not a key" orientation="white" lit={[]} highlight="lastMove" />,
      ),
    );
    expect(host.childElementCount).toBe(0);
    act(() => root.unmount());
  });

  it('fills its parent with no square size', () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    act(() =>
      root.render(
        <MiniBoard position={AFTER_E4} orientation="white" lit={[]} highlight="lastMove" />,
      ),
    );
    const board = host.firstElementChild as HTMLElement;
    const ranks = [...board.children] as HTMLElement[];
    expect(getComputedStyle(board).width).toBe('100%');
    expect(ranks).toHaveLength(8);
    // Each rank's eight squares share its width.
    for (const rank of ranks) {
      expect(rank.children).toHaveLength(8);
      for (const square of rank.children) expect(getComputedStyle(square).flexGrow).toBe('1');
    }
    act(() => root.unmount());
  });
});
